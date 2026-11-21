import { levelDbCrc32c, unmaskLevelDbCrc32c } from "./leveldb-crc32c.ts";
import { readLevelDbLengthPrefixed } from "./leveldb-codec.ts";

const BLOCK_BYTES = 32 * 1024;
const HEADER_BYTES = 7;
const MAX_SEQUENCE = (1n << 56n) - 1n;

export interface LevelDbLogOptions {
  maxBytes?: number;
  maxLogicalRecordBytes?: number;
  maxRecords?: number;
  signal?: AbortSignal;
}

export interface LevelDbWrite {
  sequence: bigint;
  type: "put" | "delete";
  key: Uint8Array;
  value: Uint8Array | null;
}

const assertActive = (signal?: AbortSignal) => signal?.throwIfAborted();
const own = (bytes: Uint8Array) => new Uint8Array(bytes);
const allZero = (bytes: Uint8Array) => bytes.every(byte => byte === 0);

/** Reads strict, checksum-verified LevelDB logical records from one manifest or WAL file. */
export const readLevelDbLog = (bytes: Uint8Array, options: LevelDbLogOptions = {}): Uint8Array[] => {
  const maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
  const maxLogicalRecordBytes = options.maxLogicalRecordBytes ?? 16 * 1024 * 1024;
  const maxRecords = options.maxRecords ?? 131072;
  if (!(bytes instanceof Uint8Array) || !Number.isSafeInteger(maxBytes) || maxBytes < HEADER_BYTES || bytes.length > maxBytes ||
    !Number.isSafeInteger(maxLogicalRecordBytes) || maxLogicalRecordBytes < 1 || maxLogicalRecordBytes > maxBytes ||
    !Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 1_000_000)
    throw new Error("Invalid LevelDB log limits");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records: Uint8Array[] = [];
  let pending: Uint8Array[] | null = null, pendingBytes = 0;
  for (let blockStart = 0; blockStart < bytes.length; blockStart += BLOCK_BYTES) {
    assertActive(options.signal);
    const blockEnd = Math.min(bytes.length, blockStart + BLOCK_BYTES);
    let offset = blockStart;
    while (offset < blockEnd) {
      const remaining = blockEnd - offset;
      if (remaining < HEADER_BYTES) {
        if (!allZero(bytes.subarray(offset, blockEnd))) throw new Error("Invalid LevelDB log trailer");
        break;
      }
      const masked = view.getUint32(offset, true), length = view.getUint16(offset + 4, true), type = view.getUint8(offset + 6);
      if (type === 0 && length === 0) {
        if (!allZero(bytes.subarray(offset, blockEnd))) throw new Error("Invalid LevelDB zero record padding");
        break;
      }
      if (type < 1 || type > 4 || length > remaining - HEADER_BYTES) throw new Error("Invalid LevelDB physical record");
      const payload = bytes.subarray(offset + HEADER_BYTES, offset + HEADER_BYTES + length);
      const check = new Uint8Array(1 + payload.length); check[0] = type; check.set(payload, 1);
      if (unmaskLevelDbCrc32c(masked) !== levelDbCrc32c(check)) throw new Error("LevelDB log checksum mismatch");
      offset += HEADER_BYTES + length;
      if (type === 1) {
        if (pending) throw new Error("LevelDB full record interrupted a fragmented record");
        if (payload.length > maxLogicalRecordBytes) throw new Error("LevelDB logical record exceeds byte limit");
        records.push(own(payload));
      } else if (type === 2) {
        if (pending) throw new Error("LevelDB fragment has duplicate start");
        pending = [own(payload)]; pendingBytes = payload.length;
      } else if (type === 3) {
        if (!pending) throw new Error("LevelDB middle fragment has no start");
        pending.push(own(payload)); pendingBytes += payload.length;
      } else {
        if (!pending) throw new Error("LevelDB last fragment has no start");
        pending.push(own(payload)); pendingBytes += payload.length;
        if (pendingBytes > maxLogicalRecordBytes) throw new Error("LevelDB logical record exceeds byte limit");
        const record = new Uint8Array(pendingBytes); let cursor = 0;
        for (const part of pending) { record.set(part, cursor); cursor += part.length; }
        records.push(record); pending = null; pendingBytes = 0;
      }
      if (pendingBytes > maxLogicalRecordBytes || records.length > maxRecords) throw new Error("LevelDB log exceeds record limits");
    }
  }
  if (pending) throw new Error("Truncated LevelDB fragmented record");
  return records;
};

/** Decodes one official LevelDB WriteBatch logical record without applying it to mutable state. */
export const readLevelDbWriteBatch = (bytes: Uint8Array, options: { maxRecords?: number; maxKeyBytes?: number; maxValueBytes?: number } = {}): LevelDbWrite[] => {
  const maxRecords = options.maxRecords ?? 65536, maxKeyBytes = options.maxKeyBytes ?? 1024, maxValueBytes = options.maxValueBytes ?? 2 * 1024 * 1024;
  if (!(bytes instanceof Uint8Array) || bytes.length < 12 || !Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 1_000_000 ||
    !Number.isSafeInteger(maxKeyBytes) || maxKeyBytes < 1 || !Number.isSafeInteger(maxValueBytes) || maxValueBytes < 1)
    throw new Error("Invalid LevelDB WriteBatch limits");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sequence = view.getBigUint64(0, true), count = view.getUint32(8, true);
  if (sequence > MAX_SEQUENCE || count > maxRecords || sequence + BigInt(count || 1) - 1n > MAX_SEQUENCE)
    throw new Error("Invalid LevelDB WriteBatch identity");
  const state = { offset: 12 }, writes: LevelDbWrite[] = [];
  for (let index = 0; index < count; index++) {
    if (state.offset >= bytes.length) throw new Error("Truncated LevelDB WriteBatch");
    const tag = bytes[state.offset++];
    if (tag !== 0 && tag !== 1) throw new Error("Unknown LevelDB WriteBatch operation");
    const key = readLevelDbLengthPrefixed(bytes, state, maxKeyBytes, "key");
    const value = tag === 1 ? readLevelDbLengthPrefixed(bytes, state, maxValueBytes, "value") : null;
    writes.push({ sequence: sequence + BigInt(index), type: tag === 1 ? "put" : "delete", key, value });
  }
  if (state.offset !== bytes.length || writes.length !== count) throw new Error("LevelDB WriteBatch count mismatch");
  return writes;
};
