import { readLevelDbLengthPrefixed, readLevelDbVarint } from "./leveldb-codec.ts";
import { readLevelDbLog } from "./read-leveldb-log.ts";

const MAX_SEQUENCE = (1n << 56n) - 1n;

export interface LevelDbFileMetadata {
  level: number;
  number: number;
  size: number;
  smallest: Uint8Array;
  largest: Uint8Array;
}

export interface LevelDbManifest {
  comparator: string;
  logNumber: number;
  previousLogNumber: number;
  nextFileNumber: number;
  lastSequence: bigint;
  files: readonly LevelDbFileMetadata[];
}

const number = (value: bigint, label: string): number => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`Invalid LevelDB ${label}`);
  return Number(value);
};
const compare = (left: Uint8Array, right: Uint8Array) => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) if (left[index] !== right[index]) return left[index] - right[index];
  return left.length - right.length;
};
const level = (bytes: Uint8Array, state: { offset: number }): number => {
  const value = number(readLevelDbVarint(bytes, state, 32), "level");
  if (value < 0 || value > 6) throw new Error("Invalid LevelDB level");
  return value;
};
const internalKey = (bytes: Uint8Array, state: { offset: number }, label: string): Uint8Array => {
  const key = readLevelDbLengthPrefixed(bytes, state, 2048, label);
  if (key.length < 8) throw new Error(`Invalid LevelDB ${label}`);
  const trailer = new DataView(key.buffer, key.byteOffset + key.length - 8, 8).getBigUint64(0, true);
  if ((trailer & 0xffn) > 1n || trailer >> 8n > MAX_SEQUENCE) throw new Error(`Invalid LevelDB ${label}`);
  return key;
};

export const parseLevelDbCurrent = (bytes: Uint8Array): string => {
  if (!(bytes instanceof Uint8Array) || bytes.length < 11 || bytes.length > 128) throw new Error("Invalid LevelDB CURRENT file");
  let value: string;
  try { value = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("Invalid LevelDB CURRENT encoding"); }
  if (!/^MANIFEST-[0-9]{6,}\r?\n$/.test(value)) throw new Error("Invalid LevelDB CURRENT file");
  return value.trimEnd();
};

/** Replays the active MANIFEST into an immutable table/log selection. */
export const readLevelDbManifest = (bytes: Uint8Array, options: {
  expectedComparator?: string; maxBytes?: number; maxFiles?: number; signal?: AbortSignal;
} = {}): LevelDbManifest => {
  const maxFiles = options.maxFiles ?? 131072;
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1 || maxFiles > 1_000_000) throw new Error("Invalid LevelDB manifest limits");
  const records = readLevelDbLog(bytes, { maxBytes: options.maxBytes ?? 16 * 1024 * 1024,
    maxLogicalRecordBytes: 4 * 1024 * 1024, maxRecords: 131072, signal: options.signal });
  if (!records.length) throw new Error("Empty LevelDB manifest");
  let comparator: string | null = null, logNumber: number | null = null, previousLogNumber = 0;
  let nextFileNumber: number | null = null, lastSequence: bigint | null = null;
  const files = new Map<string, LevelDbFileMetadata>();
  for (const record of records) {
    options.signal?.throwIfAborted();
    const state = { offset: 0 };
    while (state.offset < record.length) {
      const tag = number(readLevelDbVarint(record, state, 32), "manifest tag");
      if (tag === 1) {
        const raw = readLevelDbLengthPrefixed(record, state, 256, "comparator");
        let value: string; try { value = new TextDecoder("utf-8", { fatal: true }).decode(raw); }
        catch { throw new Error("Invalid LevelDB comparator encoding"); }
        if (!value || comparator && comparator !== value) throw new Error("Conflicting LevelDB comparator");
        comparator = value;
      } else if (tag === 2) logNumber = number(readLevelDbVarint(record, state, 64), "log number");
      else if (tag === 3) nextFileNumber = number(readLevelDbVarint(record, state, 64), "next file number");
      else if (tag === 4) {
        const value = readLevelDbVarint(record, state, 64); if (value > MAX_SEQUENCE) throw new Error("Invalid LevelDB last sequence"); lastSequence = value;
      } else if (tag === 5) { level(record, state); internalKey(record, state, "compaction pointer"); }
      else if (tag === 6) {
        const fileLevel = level(record, state), fileNumber = number(readLevelDbVarint(record, state, 64), "deleted file number");
        files.delete(`${fileLevel}:${fileNumber}`);
      } else if (tag === 7) {
        const fileLevel = level(record, state), fileNumber = number(readLevelDbVarint(record, state, 64), "file number");
        const size = number(readLevelDbVarint(record, state, 64), "file size");
        if (size < 48) throw new Error("Invalid LevelDB file size");
        const metadata = { level: fileLevel, number: fileNumber, size, smallest: internalKey(record, state, "smallest key"),
          largest: internalKey(record, state, "largest key") };
        files.set(`${fileLevel}:${fileNumber}`, metadata);
        if (files.size > maxFiles) throw new Error("LevelDB manifest exceeds file limit");
      } else if (tag === 9) previousLogNumber = number(readLevelDbVarint(record, state, 64), "previous log number");
      else throw new Error("Unknown LevelDB manifest tag");
    }
  }
  if (!comparator || logNumber === null || nextFileNumber === null || lastSequence === null ||
    options.expectedComparator && comparator !== options.expectedComparator) throw new Error("Incomplete or incompatible LevelDB manifest");
  const activeFiles = [...files.values()], fileNumbers = new Set<number>();
  for (const file of activeFiles) {
    if (file.number < 1 || fileNumbers.has(file.number) || compare(file.smallest.subarray(0, -8), file.largest.subarray(0, -8)) > 0)
      throw new Error("Invalid active LevelDB file metadata");
    fileNumbers.add(file.number);
  }
  return Object.freeze({ comparator, logNumber, previousLogNumber, nextFileNumber, lastSequence,
    files: Object.freeze(activeFiles.sort((left, right) => left.level - right.level || left.number - right.number)) });
};
