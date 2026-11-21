"""Read unencrypted UnityFS scene bundles without expanding unrelated scenes."""

import io
import struct
from pathlib import Path

from UnityPy.helpers.CompressionHelper import DECOMPRESSION_MAP


def read_exact(stream, size):
    data = stream.read(size)
    if len(data) != size:
        raise ValueError('Truncated UnityFS bundle')
    return data


def number(stream, fmt):
    return struct.unpack('>' + fmt, read_exact(stream, struct.calcsize('>' + fmt)))[0]


def cstring(stream):
    value = bytearray()
    while len(value) < 16384:
        char = read_exact(stream, 1)
        if char == b'\0':
            return value.decode('utf-8')
        value.extend(char)
    raise ValueError('Invalid UnityFS string')


def decompress(data, expected, flags):
    if flags & ~0x3f:
        raise ValueError('Unsupported UnityFS compression flags')
    decoder = DECOMPRESSION_MAP.get(flags & 0x3f)
    if decoder is None:
        raise ValueError('Unsupported UnityFS compression')
    result = decoder(data, expected)
    if len(result) != expected:
        raise ValueError('UnityFS decompressed size mismatch')
    return result


class SceneBundle:
    def __init__(self, path):
        self.path = Path(path)
        with self.path.open('rb') as stream:
            if cstring(stream) != 'UnityFS':
                raise ValueError('Expected UnityFS scene bundle')
            version = number(stream, 'I')
            cstring(stream)
            self.unity_version = cstring(stream)
            size = number(stream, 'Q')
            packed, unpacked, flags = (number(stream, 'I') for _ in range(3))
            if version not in (6, 7, 8) or size != self.path.stat().st_size or flags & ~0x3ff:
                raise ValueError('Unsupported UnityFS header')
            if packed > size or unpacked > 128 * 1024**2:
                raise ValueError('Invalid UnityFS directory size')
            if version >= 7:
                stream.seek((-stream.tell()) % 16, 1)
            data_start = stream.tell()
            if flags & 0x80:
                stream.seek(size - packed)
            header = io.BytesIO(decompress(read_exact(stream, packed), unpacked, flags & 0x3f))
            if flags & 0x80:
                stream.seek(data_start)
            if flags & 0x200:
                stream.seek((-stream.tell()) % 16, 1)
            compressed_offset = stream.tell()
            read_exact(header, 16)
            block_count = number(header, 'I')
            if block_count > 1000000:
                raise ValueError('Invalid UnityFS block count')
            self.blocks = []
            offset = 0
            for _ in range(block_count):
                raw_size, packed_size, block_flags = number(header, 'I'), number(header, 'I'), number(header, 'H')
                if block_flags & ~0x3f or raw_size > 128 * 1024**2:
                    raise ValueError('Unsupported UnityFS block flags or size')
                self.blocks.append((offset, raw_size, compressed_offset, packed_size, block_flags))
                offset += raw_size
                compressed_offset += packed_size
            if compressed_offset > (size - packed if flags & 0x80 else size):
                raise ValueError('UnityFS block data exceeds bundle')
            self.entries = {}
            for _ in range(number(header, 'I')):
                start, length, entry_flags = number(header, 'Q'), number(header, 'Q'), number(header, 'I')
                name = cstring(header)
                if name in self.entries or start + length > offset or length > 8 * 1024**3:
                    raise ValueError('Invalid or duplicate UnityFS directory entry')
                self.entries[name] = (start, length, entry_flags)
            if header.read(1):
                raise ValueError('Unexpected UnityFS directory trailing data')

    def read(self, name):
        start, length, _ = self.entries[name]
        end = start + length
        output = bytearray()
        with self.path.open('rb') as stream:
            for offset, raw_size, packed_offset, packed_size, flags in self.blocks:
                if offset >= end:
                    break
                if offset + raw_size <= start:
                    continue
                stream.seek(packed_offset)
                data = decompress(read_exact(stream, packed_size), raw_size, flags)
                output.extend(data[max(0, start - offset):min(raw_size, end - offset)])
        if len(output) != length:
            raise ValueError('UnityFS entry read was incomplete')
        return bytes(output)
