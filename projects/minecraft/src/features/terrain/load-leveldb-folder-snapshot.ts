import { parseLevelDbCurrent, readLevelDbManifest, type LevelDbFileMetadata } from "./read-leveldb-manifest.ts";
import { readLevelDbLog, readLevelDbWriteBatch, type LevelDbWrite } from "./read-leveldb-log.ts";
import { readLevelDbTable, type LevelDbTableEntry } from "./read-leveldb-table.ts";

export interface LevelDbFolderFile {
  name: string;
  size: number;
  lastModified: number;
  webkitRelativePath?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

export interface LevelDbFolderSnapshot {
  root: string;
  manifestName: string;
  selectedTables: readonly number[];
  selectedLogs: readonly number[];
  bytesRead: number;
  values: ReadonlyMap<string, Uint8Array>;
}

export interface LevelDbFolderSnapshotOptions {
  expectedComparator: string;
  desiredKeys: readonly Uint8Array[];
  maxFiles?: number;
  maxInputFiles?: number;
  maxTotalBytes?: number;
  maxFileBytes?: number;
  signal?: AbortSignal;
}

const identity = (bytes: Uint8Array) => {
  let value = ""; for (const byte of bytes) value += byte.toString(16).padStart(2, "0"); return value;
};
const compare = (left: Uint8Array, right: Uint8Array) => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) if (left[index] !== right[index]) return left[index] - right[index];
  return left.length - right.length;
};
const userKey = (internal: Uint8Array) => internal.subarray(0, internal.length - 8);
const containsAny = (file: LevelDbFileMetadata, keys: readonly Uint8Array[]) => {
  const smallest = userKey(file.smallest), largest = userKey(file.largest);
  return keys.some(key => compare(key, smallest) >= 0 && compare(key, largest) <= 0);
};
const parts = (file: LevelDbFolderFile) => (file.webkitRelativePath || file.name).replaceAll("\\", "/").split("/").filter(Boolean);

const read = async (file: LevelDbFolderFile, maxBytes: number, signal?: AbortSignal) => {
  signal?.throwIfAborted();
  const size = file.size, lastModified = file.lastModified;
  if (!Number.isSafeInteger(size) || size < 1 || size > maxBytes || !Number.isFinite(lastModified) || lastModified < 0)
    throw new Error("Invalid or oversized LevelDB snapshot file");
  const buffer = await file.arrayBuffer(); signal?.throwIfAborted();
  if (buffer.byteLength !== size || file.size !== size || file.lastModified !== lastModified)
    throw new Error("LevelDB snapshot file changed while reading");
  return new Uint8Array(buffer);
};

/** Reads only active, range-relevant files from one explicitly selected LevelDB world folder. */
export const loadLevelDbFolderSnapshot = async (files: readonly LevelDbFolderFile[], options: LevelDbFolderSnapshotOptions): Promise<LevelDbFolderSnapshot> => {
  const maxFiles = options.maxFiles ?? 64, maxTotalBytes = options.maxTotalBytes ?? 128 * 1024 * 1024;
  const maxInputFiles = options.maxInputFiles ?? 8192, maxFileBytes = options.maxFileBytes ?? 64 * 1024 * 1024;
  if (!Array.isArray(files) || !files.length || !options.expectedComparator || !Number.isSafeInteger(maxFiles) || maxFiles < 1 || maxFiles > 512 ||
    !Number.isSafeInteger(maxInputFiles) || maxInputFiles < 1 || maxInputFiles > 65536 || files.length > maxInputFiles ||
    !Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 1 || !Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1 ||
    !Array.isArray(options.desiredKeys) || !options.desiredKeys.length || options.desiredKeys.length > 4096 ||
    options.desiredKeys.some(key => !(key instanceof Uint8Array) || !key.length || key.length > 1024))
    throw new Error("Invalid LevelDB folder snapshot request");
  const dbFiles = files.map(file => ({ file, path: parts(file) })).filter(entry => entry.path.at(-2)?.toLocaleLowerCase("en-US") === "db");
  if (!dbFiles.length) throw new Error("Selected folder does not contain a LevelDB db directory");
  const roots = new Set(dbFiles.map(entry => entry.path.slice(0, -2).join("/")));
  if (roots.size !== 1) throw new Error("LevelDB files belong to different world roots");
  const byName = new Map<string, LevelDbFolderFile>();
  for (const entry of dbFiles) {
    const name = entry.path.at(-1)!.toLocaleLowerCase("en-US");
    if (byName.has(name)) throw new Error("Duplicate LevelDB snapshot filename");
    byName.set(name, entry.file);
  }
  const currentFile = byName.get("current"); if (!currentFile) throw new Error("LevelDB CURRENT file is missing");
  if (currentFile.size > maxTotalBytes) throw new Error("LevelDB snapshot exceeds byte limit");
  let bytesRead = currentFile.size;
  const manifestName = parseLevelDbCurrent(await read(currentFile, Math.min(128, maxFileBytes), options.signal));
  const manifestFile = byName.get(manifestName.toLocaleLowerCase("en-US"));
  if (!manifestFile) throw new Error("Active LevelDB MANIFEST file is missing");
  if (manifestFile.size > maxTotalBytes - bytesRead) throw new Error("LevelDB snapshot exceeds byte limit");
  bytesRead += manifestFile.size;
  const manifest = readLevelDbManifest(await read(manifestFile, Math.min(maxFileBytes, 16 * 1024 * 1024), options.signal),
    { expectedComparator: options.expectedComparator, signal: options.signal });
  const desired = new Set(options.desiredKeys.map(identity));
  const tables = manifest.files.filter(file => containsAny(file, options.desiredKeys));
  const logNumbers = [...new Set([manifest.previousLogNumber, manifest.logNumber].filter(value => value > 0))].sort((left, right) => left - right);
  if (2 + tables.length + logNumbers.length > maxFiles) throw new Error("LevelDB snapshot exceeds file limit");
  const latest = new Map<string, LevelDbTableEntry | LevelDbWrite>();
  const apply = (entry: LevelDbTableEntry | LevelDbWrite) => {
    const key = identity(entry.key), previous = latest.get(key);
    if (!desired.has(key)) return;
    if (!previous || entry.sequence > previous.sequence) latest.set(key, entry);
    else if (entry.sequence === previous.sequence) {
      const valuesMatch = entry.value?.length === previous.value?.length &&
        entry.value?.every((byte, index) => byte === previous.value?.[index]);
      if (entry.type !== previous.type || entry.type === "put" && !valuesMatch)
        throw new Error("Conflicting LevelDB records share one sequence");
    }
  };
  for (const metadata of tables) {
    options.signal?.throwIfAborted();
    const name = `${metadata.number.toString().padStart(6, "0")}.ldb`, file = byName.get(name);
    if (!file || file.size !== metadata.size) throw new Error("Active LevelDB table is missing or changed");
    if (file.size > maxTotalBytes - bytesRead) throw new Error("LevelDB snapshot exceeds byte limit");
    bytesRead += file.size;
    for (const entry of readLevelDbTable(await read(file, maxFileBytes, options.signal), { maxBytes: maxFileBytes,
      maxEntries: 262144, acceptKey: key => desired.has(identity(key)), signal: options.signal })) apply(entry);
  }
  for (const logNumber of logNumbers) {
    options.signal?.throwIfAborted();
    const name = `${logNumber.toString().padStart(6, "0")}.log`, file = byName.get(name);
    if (!file) throw new Error("Active LevelDB log is missing");
    if (file.size > maxTotalBytes - bytesRead) throw new Error("LevelDB snapshot exceeds byte limit");
    bytesRead += file.size;
    for (const record of readLevelDbLog(await read(file, maxFileBytes, options.signal), { maxBytes: maxFileBytes, signal: options.signal }))
      for (const entry of readLevelDbWriteBatch(record)) apply(entry);
  }
  const values = new Map<string, Uint8Array>();
  for (const [key, entry] of latest) if (entry.type === "put" && entry.value) values.set(key, new Uint8Array(entry.value));
  return Object.freeze({ root: [...roots][0], manifestName, selectedTables: Object.freeze(tables.map(file => file.number)),
    selectedLogs: Object.freeze(logNumbers), bytesRead, values });
};
