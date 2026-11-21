import { loadLevelDbFolderSnapshot, type LevelDbFolderFile } from "./load-leveldb-folder-snapshot.ts";
import { encodePersistentSubchunkKey, type PersistentSubchunkKey, type PersistentSubchunkKeySchema } from "./persistent-subchunk-key.ts";
import { readLayeredSubchunk, type DecodedSubchunk, type LayeredSubchunkSchema } from "./read-layered-subchunk.ts";

export type PersistentSubchunkSnapshotRequest = PersistentSubchunkKey;

export interface PersistentSubchunkSnapshotSection {
  key: PersistentSubchunkSnapshotRequest;
  subchunk: DecodedSubchunk;
}

export interface PersistentSubchunkSnapshot {
  root: string;
  manifestName: string;
  bytesRead: number;
  selectedTables: readonly number[];
  selectedLogs: readonly number[];
  sections: readonly PersistentSubchunkSnapshotSection[];
  missing: readonly PersistentSubchunkSnapshotRequest[];
}

export interface PersistentSubchunkSnapshotOptions {
  expectedComparator: string;
  requests: readonly PersistentSubchunkSnapshotRequest[];
  keySchema: PersistentSubchunkKeySchema;
  subchunkSchema: LayeredSubchunkSchema;
  paletteVersions: readonly number[];
  maxFiles?: number;
  maxInputFiles?: number;
  maxTotalBytes?: number;
  maxFileBytes?: number;
  maxSubchunkBytes?: number;
  signal?: AbortSignal;
}

const identity = (bytes: Uint8Array) => {
  let value = "";
  for (const byte of bytes) value += byte.toString(16).padStart(2, "0");
  return value;
};

/** Loads requested persistent subchunks from an explicit folder snapshot and decodes only verified values. */
export const loadPersistentSubchunkSnapshot = async (
  files: readonly LevelDbFolderFile[], options: PersistentSubchunkSnapshotOptions,
): Promise<PersistentSubchunkSnapshot> => {
  if (!Array.isArray(options.requests) || !options.requests.length || options.requests.length > 4096 ||
    !Array.isArray(options.paletteVersions) || !options.paletteVersions.length || options.paletteVersions.length > 64 ||
    options.paletteVersions.some(version => !Number.isSafeInteger(version) || version < 0))
    throw new Error("Invalid persistent subchunk snapshot request");
  const encoded = options.requests.map(request => encodePersistentSubchunkKey(request, options.keySchema));
  const identities = encoded.map(identity);
  if (new Set(identities).size !== identities.length) throw new Error("Duplicate persistent subchunk request");
  const snapshot = await loadLevelDbFolderSnapshot(files, {
    expectedComparator: options.expectedComparator,
    desiredKeys: encoded,
    maxFiles: options.maxFiles,
    maxInputFiles: options.maxInputFiles,
    maxTotalBytes: options.maxTotalBytes,
    maxFileBytes: options.maxFileBytes,
    signal: options.signal,
  });
  const sections: PersistentSubchunkSnapshotSection[] = [], missing: PersistentSubchunkSnapshotRequest[] = [];
  for (let index = 0; index < options.requests.length; index++) {
    options.signal?.throwIfAborted();
    const request = options.requests[index], value = snapshot.values.get(identities[index]);
    if (!value) { missing.push(Object.freeze({ ...request })); continue; }
    const subchunk = readLayeredSubchunk(value, {
      schema: options.subchunkSchema,
      sectionY: request.sectionY,
      paletteVersions: options.paletteVersions,
      maxBytes: options.maxSubchunkBytes,
      signal: options.signal,
    });
    sections.push(Object.freeze({ key: Object.freeze({ ...request }), subchunk }));
  }
  return Object.freeze({
    root: snapshot.root,
    manifestName: snapshot.manifestName,
    bytesRead: snapshot.bytesRead,
    selectedTables: snapshot.selectedTables,
    selectedLogs: snapshot.selectedLogs,
    sections: Object.freeze(sections),
    missing: Object.freeze(missing),
  });
};
