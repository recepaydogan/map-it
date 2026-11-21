export interface StoredZipFile {
  path: string;
  data: string | Uint8Array;
}

const MAX_FILES = 64;
const MAX_PATH_BYTES = 512;
const MAX_DATA_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < table.length; value++) {
    let crc = value;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table[value] = crc >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const validPath = (path: string): boolean => path.length > 0 && !path.startsWith("/") && !path.includes("\\")
  && path.split("/").every(segment => segment.length > 0 && segment !== "." && segment !== "..");

const writeHeader = (size: number, fill: (view: DataView) => void): Uint8Array => {
  const bytes = new Uint8Array(size);
  fill(new DataView(bytes.buffer));
  return bytes;
};

const concatenate = (parts: readonly Uint8Array[], total: number): Uint8Array => {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
};

/** Builds a deterministic, uncompressed UTF-8 ZIP without retaining caller-owned buffers. */
export const createStoredZip = (files: readonly StoredZipFile[]): Uint8Array => {
  if (files.length < 1 || files.length > MAX_FILES) throw new Error("Invalid ZIP file count.");
  const names = new Set<string>();
  let dataBytes = 0;
  const entries = files.map(file => {
    if (!validPath(file.path) || names.has(file.path)) throw new Error("Invalid or duplicate ZIP path.");
    names.add(file.path);
    const name = encoder.encode(file.path);
    if (name.length > MAX_PATH_BYTES) throw new Error("ZIP path is too long.");
    const data = typeof file.data === "string" ? encoder.encode(file.data) : new Uint8Array(file.data);
    dataBytes += data.length;
    if (dataBytes > MAX_DATA_BYTES) throw new Error("ZIP data exceeds the byte budget.");
    return { name, data, crc: crc32(data), offset: 0 };
  });

  const local: Uint8Array[] = [];
  let localSize = 0;
  for (const entry of entries) {
    entry.offset = localSize;
    const header = writeHeader(30, view => {
      view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true); view.setUint16(10, 0, true); view.setUint16(12, 33, true);
      view.setUint32(14, entry.crc, true); view.setUint32(18, entry.data.length, true);
      view.setUint32(22, entry.data.length, true); view.setUint16(26, entry.name.length, true); view.setUint16(28, 0, true);
    });
    local.push(header, entry.name, entry.data);
    localSize += header.length + entry.name.length + entry.data.length;
  }

  const central: Uint8Array[] = [];
  let centralSize = 0;
  for (const entry of entries) {
    const header = writeHeader(46, view => {
      view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true);
      view.setUint16(8, 0x0800, true); view.setUint16(10, 0, true); view.setUint16(12, 0, true); view.setUint16(14, 33, true);
      view.setUint32(16, entry.crc, true); view.setUint32(20, entry.data.length, true); view.setUint32(24, entry.data.length, true);
      view.setUint16(28, entry.name.length, true); view.setUint16(30, 0, true); view.setUint16(32, 0, true);
      view.setUint16(34, 0, true); view.setUint16(36, 0, true); view.setUint32(38, 0, true); view.setUint32(42, entry.offset, true);
    });
    central.push(header, entry.name);
    centralSize += header.length + entry.name.length;
  }
  const end = writeHeader(22, view => {
    view.setUint32(0, 0x06054b50, true); view.setUint16(4, 0, true); view.setUint16(6, 0, true);
    view.setUint16(8, entries.length, true); view.setUint16(10, entries.length, true);
    view.setUint32(12, centralSize, true); view.setUint32(16, localSize, true); view.setUint16(20, 0, true);
  });
  return concatenate([...local, ...central, end], localSize + centralSize + end.length);
};
