/** Inspect a BC3 export. A zero-sized export is not proof of an empty native
 * map; pass its original texture descriptor to detect extraction truncation. */
export const inspectBc3Raster = (buffer, expectedSize) => {
  if (buffer.length < 128 || buffer.readUInt32LE(0) !== 0x20534444 || buffer.readUInt32LE(4) !== 124) {
    throw new Error("Invalid DDS source header.");
  }
  const width = buffer.readUInt32LE(16);
  const height = buffer.readUInt32LE(12);
  if (expectedSize && (width !== expectedSize.width || height !== expectedSize.height)) {
    throw new Error(`DDS dimensions ${width}x${height} disagree with the native texture ${expectedSize.width}x${expectedSize.height}.`);
  }
  if (!width || !height) return { status: "zero-sized", width, height };
  if (buffer.readUInt32LE(84) !== 0x35545844) throw new Error("Expected a BC3/DXT5 DDS source.");
  const columns = Math.ceil(width / 4);
  const rows = Math.ceil(height / 4);
  if (buffer.length < 128 + columns * rows * 16) throw new Error("Truncated DDS base image.");
  for (let block = 0; block < columns * rows; block += 1) {
    const offset = 128 + block * 16;
    const alpha0 = buffer[offset];
    const alpha1 = buffer[offset + 1];
    let indices = buffer.readUIntLE(offset + 2, 6);
    // A common transparent block; index 7 is not zero-alpha in the short palette.
    if (alpha0 === 0 && alpha1 === 0 && indices === 0) continue;
    const alpha = [alpha0, alpha1];
    if (alpha0 > alpha1) {
      for (let index = 1; index <= 6; index += 1) alpha.push(((7 - index) * alpha0 + index * alpha1) / 7);
    } else {
      for (let index = 1; index <= 4; index += 1) alpha.push(((5 - index) * alpha0 + index * alpha1) / 5);
      alpha.push(0, 255);
    }
    for (let pixel = 0; pixel < 16; pixel += 1) {
      const value = alpha[indices % 8];
      indices = Math.floor(indices / 8);
      const x = block % columns * 4 + pixel % 4;
      const y = Math.floor(block / columns) * 4 + Math.floor(pixel / 4);
      if (x < width && y < height && Math.round(value) > 0) return { status: "visible", width, height };
    }
  }
  return { status: "transparent", width, height };
};
