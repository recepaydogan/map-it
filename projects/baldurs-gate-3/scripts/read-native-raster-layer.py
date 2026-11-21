"""Decode a real DDS layer for an independent audit; emit metadata and RGBA bytes."""

import json
import math
import struct
import sys

import numpy as np
from PIL import Image


def read_bc3_alpha(source, width, height):
    """Decode BC3 alpha independently with nearest-integer UNORM8 quantization.

    BC3 defines interpolated values before 8-bit rounding. Pillow truncates
    some of these values; the production decoder rounds to nearest instead.
    Neither difference is an excuse to permit unexplained geometry changes.
    """
    result = np.empty((height, width), dtype=np.uint8)
    with open(source, "rb") as stream:
        header = stream.read(128)
        assert header[:4] == b"DDS " and header[84:88] == b"DXT5"
        assert struct.unpack_from("<II", header, 12) == (height, width)
        columns = (width + 3) // 4
        for row in range((height + 3) // 4):
            blocks = np.frombuffer(stream.read(columns * 16), dtype=np.uint8).reshape(columns, 16)
            first, second = blocks[:, 0].astype(np.uint16), blocks[:, 1].astype(np.uint16)
            palette = np.empty((columns, 8), dtype=np.uint16)
            palette[:, 0], palette[:, 1] = first, second
            for index in range(1, 7):
                seven = ((7 - index) * first + index * second + 3) // 7
                five = ((5 - index) * first + index * second + 2) // 5 if index <= 4 else (
                    np.full_like(first, 0 if index == 5 else 255)
                )
                palette[:, index + 1] = np.where(first > second, seven, five)
            packed = sum(blocks[:, index + 2].astype(np.uint64) << (8 * index) for index in range(6))
            indices = ((packed[:, None] >> (np.arange(16, dtype=np.uint64) * 3)) & 7).astype(np.intp)
            decoded = np.take_along_axis(palette, indices, axis=1).reshape(columns, 4, 4)
            result[row * 4:row * 4 + 4] = decoded.transpose(1, 0, 2).reshape(4, -1)[:min(4, height - row * 4), :width]
    return result


layer = json.loads(sys.argv[1])
image = Image.open(layer["source"]).convert("RGBA")
native_width, native_height = image.size
pixels = np.array(image)
alpha = read_bc3_alpha(layer["source"], native_width, native_height)
delta = np.abs(alpha.astype(np.int16) - pixels[:, :, 3].astype(np.int16))
alpha_quantization = {
    "pillowChangedPixels": int(np.count_nonzero(delta)),
    "pillowMaximumDelta": int(delta.max()),
    "zeroAlphaDisagreements": int(np.count_nonzero((alpha == 0) != (pixels[:, :, 3] == 0))),
    "method": "BC3 endpoint interpolation rounded to nearest UNORM8",
}
assert alpha_quantization["pillowMaximumDelta"] <= 1
pixels[:, :, 3] = alpha
image = Image.fromarray(pixels)
crop = [0, 0, native_width, native_height]
if layer.get("cropContent", True):
    visible = (pixels[:, :, 3] != 0) & (pixels[:, :, :3].max(axis=2) > 3)
    ys, xs = np.nonzero(visible)
    assert len(xs), "Native layer has no visible content"
    padding = layer.get("contentPadding", 64)
    left = max(0, math.floor((int(xs.min()) - padding) / 4) * 4)
    top = max(0, math.floor((int(ys.min()) - padding) / 4) * 4)
    right = min(native_width, math.ceil((int(xs.max()) + 1 + padding) / 4) * 4)
    bottom = min(native_height, math.ceil((int(ys.max()) + 1 + padding) / 4) * 4)
    crop = [left, top, right - left, bottom - top]
    image = image.crop((left, top, right, bottom))
x, y, width, height = crop
b = layer["worldBounds"]
world = {
    "x": b["centerX"] - b["width"] / 2 + x / native_width * b["width"],
    "y": b["centerY"] - b["height"] / 2 + (
        1 - (y + height) / native_height if layer.get("flipY", True) else y / native_height
    ) * b["height"],
    "width": width / native_width * b["width"],
    "height": height / native_height * b["height"],
}
metadata = json.dumps({"nativeWidth": native_width, "nativeHeight": native_height, "crop": crop,
                       "world": world, "alphaQuantization": alpha_quantization}).encode()
sys.stdout.buffer.write(struct.pack("<I", len(metadata)) + metadata + image.tobytes())
