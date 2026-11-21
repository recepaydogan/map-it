export type BinaryStringEncoding = "utf-8" | "modified-utf-8";

/** Decode exactly; replacement characters must not silently change saved identifiers. */
export const decodeBinaryString = (bytes: Uint8Array, encoding: BinaryStringEncoding): string => {
  if (encoding === "utf-8") return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  if (encoding !== "modified-utf-8") throw new Error("Unsupported binary string encoding");
  const units: string[] = [];
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index++];
    if (first >= 1 && first <= 127) { units.push(String.fromCharCode(first)); continue; }
    const width = first >= 0xc0 && first <= 0xdf ? 2 : first >= 0xe0 && first <= 0xef ? 3 : 0;
    if (!width || index + width - 1 > bytes.length) throw new Error("Invalid modified UTF-8 string");
    let unit = first & (width === 2 ? 31 : 15);
    for (let part = 1; part < width; part++) {
      const next = bytes[index++];
      if ((next & 0xc0) !== 0x80) throw new Error("Invalid modified UTF-8 continuation");
      unit = unit * 64 + (next & 63);
    }
    // Only the encoded null may use an otherwise overlong representation.
    if ((width === 2 && unit < 128 && unit !== 0) || (width === 3 && unit < 2048))
      throw new Error("Overlong modified UTF-8 string");
    units.push(String.fromCharCode(unit));
  }
  return units.join("");
};
