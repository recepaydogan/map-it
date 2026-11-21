const POLYNOMIAL = 0x82f63b78;
const MASK_DELTA = 0xa282ead8;

const table = new Uint32Array(256);
for (let value = 0; value < table.length; value++) {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ POLYNOMIAL : crc >>> 1;
  table[value] = crc >>> 0;
}

/** Portable CRC32C used by LevelDB physical records and table blocks. */
export const levelDbCrc32c = (bytes: Uint8Array): number => {
  if (!(bytes instanceof Uint8Array)) throw new Error("Invalid CRC32C input");
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

export const maskLevelDbCrc32c = (crc: number): number => {
  if (!Number.isSafeInteger(crc) || crc < 0 || crc > 0xffffffff) throw new Error("Invalid CRC32C value");
  return ((((crc >>> 15) | (crc << 17)) >>> 0) + MASK_DELTA) >>> 0;
};

export const unmaskLevelDbCrc32c = (masked: number): number => {
  if (!Number.isSafeInteger(masked) || masked < 0 || masked > 0xffffffff) throw new Error("Invalid masked CRC32C value");
  const rotated = (masked - MASK_DELTA) >>> 0;
  return ((rotated >>> 17) | (rotated << 15)) >>> 0;
};
