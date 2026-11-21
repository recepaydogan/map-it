"""Bounded UnityFS reader regressions, including corruption rejection."""
import runpy
import struct
import tempfile
import unittest
from pathlib import Path

SceneBundle = runpy.run_path(str(Path(__file__).with_name('scene-bundles.py')))['SceneBundle']


def bundle_bytes(duplicate=False, overflow=False):
    raw = b'other' + b'selected-scene' + b'untouched'
    entries = [('other', 0, 5), ('scene', 5, 14), ('end', 19, 9)]
    if duplicate:
        entries[-1] = ('scene', 19, 9)
    if overflow:
        entries[-1] = ('end', 19, 100)
    info = bytes(16) + struct.pack('>I', 2)
    info += struct.pack('>IIH', 12, 12, 0) + struct.pack('>IIH', len(raw) - 12, len(raw) - 12, 0)
    info += struct.pack('>I', len(entries))
    for name, offset, size in entries:
        info += struct.pack('>QQI', offset, size, 0) + name.encode() + b'\0'
    head = b'UnityFS\0' + struct.pack('>I', 7) + b'6.x.x\0' + b'6000.3.15f1\0'
    size = (len(head) + 20 + 15) // 16 * 16 + len(info) + len(raw)
    head += struct.pack('>QIII', size, len(info), len(info), 0x40)
    head += bytes(-len(head) % 16)
    return head + info + raw


class BundleTests(unittest.TestCase):
    def load(self, data):
        path = Path(self.directory.name) / 'levels0-31.assetbundle'
        path.write_bytes(data)
        return SceneBundle(path)

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.directory.cleanup()

    def test_slice_across_blocks(self):
        reader = self.load(bundle_bytes())
        self.assertEqual(reader.read('scene'), b'selected-scene')
        self.assertEqual(reader.read('other'), b'other')
        self.assertEqual(reader.read('end'), b'untouched')

    def test_reject_duplicate(self):
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            self.load(bundle_bytes(duplicate=True))

    def test_reject_outside_data(self):
        with self.assertRaisesRegex(ValueError, 'directory entry'):
            self.load(bundle_bytes(overflow=True))

    def test_reject_truncated(self):
        with self.assertRaises(ValueError):
            self.load(bundle_bytes()[:-2])

    def test_unknown_entry(self):
        with self.assertRaises(KeyError):
            self.load(bundle_bytes()).read('missing')


if __name__ == '__main__':
    unittest.main()
