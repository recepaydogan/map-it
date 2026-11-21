export interface LevelDbByteCursor { offset: number }

/** Reads one canonical unsigned LevelDB varint at the requested width. */
export const readLevelDbVarint = (bytes: Uint8Array, state: LevelDbByteCursor, maxBits: 32 | 64): bigint => {
  let result = 0n, shift = 0n;
  const limit = maxBits === 32 ? 5 : 10;
  for (let count = 0; count < limit; count++, shift += 7n) {
    if (state.offset >= bytes.length) throw new Error("Truncated LevelDB varint");
    const byte = bytes[state.offset++];
    if (count === limit - 1 && byte > (maxBits === 32 ? 0x0f : 0x01)) throw new Error("LevelDB varint overflow");
    result |= BigInt(byte & 0x7f) << shift;
    if (!(byte & 0x80)) return result;
  }
  throw new Error("Invalid LevelDB varint");
};

export const readLevelDbLengthPrefixed = (bytes: Uint8Array, state: LevelDbByteCursor, maxBytes: number, label: string): Uint8Array => {
  const length = Number(readLevelDbVarint(bytes, state, 32));
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || length > maxBytes || length > bytes.length - state.offset)
    throw new Error(`Invalid LevelDB ${label}`);
  const result = new Uint8Array(bytes.subarray(state.offset, state.offset + length)); state.offset += length; return result;
};
