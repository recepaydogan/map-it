import { Inflate, Unzlib } from "fflate";
import { readLevelDbVarint } from "./leveldb-codec.ts";
import { levelDbCrc32c, unmaskLevelDbCrc32c } from "./leveldb-crc32c.ts";

const FOOTER_BYTES = 48;
const BLOCK_TRAILER_BYTES = 5;
const MAGIC = Uint8Array.of(0x57, 0xfb, 0x80, 0x8b, 0x24, 0x75, 0x47, 0xdb);
const MAX_SEQUENCE = (1n << 56n) - 1n;

export interface LevelDbTableEntry {
  sequence: bigint;
  type: "put" | "delete";
  key: Uint8Array;
  value: Uint8Array;
}

export interface LevelDbTableOptions {
  maxBytes?: number;
  maxBlockBytes?: number;
  maxEntries?: number;
  maxKeyBytes?: number;
  maxValueBytes?: number;
  acceptKey?: (key: Uint8Array) => boolean;
  signal?: AbortSignal;
}

interface BlockHandle { offset: number; size: number }
interface RawBlockEntry { key: Uint8Array; value: Uint8Array }

const assertActive = (signal?: AbortSignal) => signal?.throwIfAborted();
const own = (bytes: Uint8Array) => new Uint8Array(bytes);
const equal = (left: Uint8Array, right: Uint8Array) => left.length === right.length && left.every((byte, index) => byte === right[index]);
const compareBytes = (left: Uint8Array, right: Uint8Array) => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) if (left[index] !== right[index]) return left[index] - right[index];
  return left.length - right.length;
};
const compareInternalKeys = (left: Uint8Array, right: Uint8Array) => {
  const userComparison = compareBytes(left.subarray(0, -8), right.subarray(0, -8));
  if (userComparison) return userComparison;
  const leftTag = new DataView(left.buffer, left.byteOffset + left.length - 8, 8).getBigUint64(0, true);
  const rightTag = new DataView(right.buffer, right.byteOffset + right.length - 8, 8).getBigUint64(0, true);
  return leftTag === rightTag ? 0 : leftTag > rightTag ? -1 : 1;
};

const handle = (bytes: Uint8Array): BlockHandle => {
  const state = { offset: 0 }, offset = readLevelDbVarint(bytes, state, 64), size = readLevelDbVarint(bytes, state, 64);
  if (state.offset !== bytes.length || offset > BigInt(Number.MAX_SAFE_INTEGER) || size > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Invalid LevelDB block handle");
  return { offset: Number(offset), size: Number(size) };
};

const inflateBounded = (input: Uint8Array, raw: boolean, maxBytes: number): Uint8Array => {
  const parts: Uint8Array[] = []; let length = 0;
  const stream = raw ? new Inflate() : new Unzlib();
  stream.ondata = data => {
    if (data.length > maxBytes - length) throw new Error("LevelDB block exceeds decompression limit");
    length += data.length; parts.push(own(data));
  };
  for (let offset = 0; offset < input.length; offset += 32768)
    stream.push(input.subarray(offset, Math.min(input.length, offset + 32768)), offset + 32768 >= input.length);
  if (input.length === 0) stream.push(input, true);
  const output = new Uint8Array(length); let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
};

const readBlock = (table: Uint8Array, block: BlockHandle, maxBlockBytes: number): Uint8Array => {
  if (!Number.isSafeInteger(block.offset) || !Number.isSafeInteger(block.size) || block.offset < 0 || block.size < 4 ||
    block.size > maxBlockBytes || block.offset > table.length - FOOTER_BYTES ||
    block.size + BLOCK_TRAILER_BYTES > table.length - FOOTER_BYTES - block.offset) throw new Error("Invalid LevelDB block bounds");
  const stored = table.subarray(block.offset, block.offset + block.size), type = table[block.offset + block.size];
  const masked = new DataView(table.buffer, table.byteOffset + block.offset + block.size + 1, 4).getUint32(0, true);
  const checked = new Uint8Array(stored.length + 1); checked.set(stored); checked[stored.length] = type;
  if (unmaskLevelDbCrc32c(masked) !== levelDbCrc32c(checked)) throw new Error("LevelDB table checksum mismatch");
  if (type === 0) return own(stored);
  if (type === 2) return inflateBounded(stored, false, maxBlockBytes);
  if (type === 4) return inflateBounded(stored, true, maxBlockBytes);
  throw new Error("Unsupported LevelDB table compression");
};

const readBlockEntries = (bytes: Uint8Array, limits: Required<Pick<LevelDbTableOptions, "maxEntries" | "maxKeyBytes" | "maxValueBytes">>): RawBlockEntry[] => {
  if (bytes.length < 8) throw new Error("Invalid LevelDB restart block");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), restartCount = view.getUint32(bytes.length - 4, true);
  if (!restartCount || restartCount > (bytes.length - 4) / 4) throw new Error("Invalid LevelDB restart count");
  const restartOffset = bytes.length - 4 * (restartCount + 1), restartSet = new Set<number>();
  let previousRestart = -1;
  for (let index = 0; index < restartCount; index++) {
    const offset = view.getUint32(restartOffset + index * 4, true);
    if (offset >= restartOffset || offset <= previousRestart || index === 0 && offset !== 0) throw new Error("Invalid LevelDB restart offset");
    restartSet.add(offset); previousRestart = offset;
  }
  const entries: RawBlockEntry[] = [], entryOffsets = new Set<number>(); let offset = 0, previous = new Uint8Array();
  while (offset < restartOffset) {
    const entryOffset = offset, state = { offset }; entryOffsets.add(entryOffset);
    const shared = Number(readLevelDbVarint(bytes.subarray(0, restartOffset), state, 32));
    const unshared = Number(readLevelDbVarint(bytes.subarray(0, restartOffset), state, 32));
    const valueLength = Number(readLevelDbVarint(bytes.subarray(0, restartOffset), state, 32));
    if (shared > previous.length || shared + unshared > limits.maxKeyBytes || valueLength > limits.maxValueBytes ||
      unshared + valueLength > restartOffset - state.offset || restartSet.has(entryOffset) && shared !== 0)
      throw new Error("Invalid LevelDB block entry");
    const key = new Uint8Array(shared + unshared); key.set(previous.subarray(0, shared));
    key.set(bytes.subarray(state.offset, state.offset + unshared), shared); state.offset += unshared;
    const value = own(bytes.subarray(state.offset, state.offset + valueLength)); state.offset += valueLength;
    entries.push({ key, value }); previous = key; offset = state.offset;
    if (entries.length > limits.maxEntries) throw new Error("LevelDB table exceeds entry limit");
  }
  if (offset !== restartOffset || [...restartSet].some(value => !entryOffsets.has(value)))
    throw new Error("LevelDB restart does not identify an entry");
  return entries;
};

/** Reads active internal records from one immutable table; manifest/WAL precedence is applied separately. */
export const readLevelDbTable = (table: Uint8Array, options: LevelDbTableOptions = {}): LevelDbTableEntry[] => {
  const maxBytes = options.maxBytes ?? 64 * 1024 * 1024, maxBlockBytes = options.maxBlockBytes ?? 8 * 1024 * 1024;
  const maxEntries = options.maxEntries ?? 262144, maxKeyBytes = options.maxKeyBytes ?? 1024, maxValueBytes = options.maxValueBytes ?? 2 * 1024 * 1024;
  if (!(table instanceof Uint8Array) || table.length < FOOTER_BYTES || table.length > maxBytes ||
    ![maxBytes, maxBlockBytes, maxEntries, maxKeyBytes, maxValueBytes].every(value => Number.isSafeInteger(value) && value > 0))
    throw new Error("Invalid LevelDB table limits");
  assertActive(options.signal);
  if (!equal(table.subarray(table.length - 8), MAGIC)) throw new Error("Invalid LevelDB table magic");
  const footer = table.subarray(table.length - FOOTER_BYTES, table.length - 8), footerState = { offset: 0 };
  readLevelDbVarint(footer, footerState, 64); readLevelDbVarint(footer, footerState, 64);
  const indexStart = footerState.offset, indexOffset = readLevelDbVarint(footer, footerState, 64), indexSize = readLevelDbVarint(footer, footerState, 64);
  if (indexOffset > BigInt(Number.MAX_SAFE_INTEGER) || indexSize > BigInt(Number.MAX_SAFE_INTEGER) ||
    !footer.subarray(footerState.offset).every(byte => byte === 0)) throw new Error("Invalid LevelDB table footer");
  const indexHandle = handle(footer.subarray(indexStart, footerState.offset));
  const limits = { maxEntries, maxKeyBytes, maxValueBytes };
  const index = readBlockEntries(readBlock(table, indexHandle, maxBlockBytes), limits);
  const entries: LevelDbTableEntry[] = []; let decodedEntries = 0, previousInternalKey: Uint8Array | null = null;
  for (const item of index) {
    assertActive(options.signal);
    for (const entry of readBlockEntries(readBlock(table, handle(item.value), maxBlockBytes), limits)) {
      decodedEntries++;
      if (entry.key.length < 8) throw new Error("Invalid LevelDB internal key");
      if (previousInternalKey && compareInternalKeys(previousInternalKey, entry.key) >= 0)
        throw new Error("LevelDB table keys are not strictly ordered");
      previousInternalKey = entry.key;
      const trailer = new DataView(entry.key.buffer, entry.key.byteOffset + entry.key.length - 8, 8).getBigUint64(0, true);
      const type = Number(trailer & 0xffn), sequence = trailer >> 8n;
      if (type > 1 || sequence > MAX_SEQUENCE || type === 0 && entry.value.length !== 0)
        throw new Error("Invalid LevelDB internal key identity");
      const key = own(entry.key.subarray(0, -8));
      if (!options.acceptKey || options.acceptKey(key))
        entries.push({ sequence, type: type === 1 ? "put" : "delete", key, value: entry.value });
      if (decodedEntries > maxEntries) throw new Error("LevelDB table exceeds entry limit");
    }
  }
  return entries;
};
