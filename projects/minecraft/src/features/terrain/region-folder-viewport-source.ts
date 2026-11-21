import { selectRegionFolderFiles } from "./region-folder-selection.ts";
import { REGION_SNAPSHOT_FILE_LIMIT, REGION_SNAPSHOT_TOTAL_BYTE_LIMIT } from "./region-snapshot-plan.ts";

export const REGION_FOLDER_FILE_INVENTORY_LIMIT = 65_536;

export interface RegionFolderViewportFile {
  name: string;
  size: number;
  lastModified: number;
  webkitRelativePath: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

export interface RegionFolderViewportSnapshotFile {
  name: string;
  bytes: Uint8Array;
  lastModified: number;
}

export interface RegionFolderViewportSnapshot {
  files: readonly RegionFolderViewportSnapshotFile[];
  focus: Readonly<{ x: number; z: number }>;
  focusRegion: Readonly<{ x: number; z: number }>;
  matchedFiles: number;
  folderLabel: string;
  selectionKey: string;
}

export interface RegionFolderViewportSource {
  load: (focus: { x: number; z: number }, signal?: AbortSignal) => Promise<Readonly<RegionFolderViewportSnapshot>>;
  needsLoad: (focus: { x: number; z: number }) => boolean;
  getSnapshot: () => Readonly<RegionFolderViewportSnapshot> | null;
  dispose: () => void;
}

const cancelled = (message: string) => Object.assign(new Error(message), { name: "AbortError" });
const regionAt = (focus: { x: number; z: number }) => {
  if (![focus.x, focus.z].every(Number.isFinite)) throw new Error("Invalid region folder viewport focus.");
  return { x: Math.floor(focus.x / 512), z: Math.floor(focus.z / 512) };
};
const fileKey = (file: RegionFolderViewportFile) => JSON.stringify([
  file.webkitRelativePath.toLocaleLowerCase("en-US"), file.size, file.lastModified,
]);

/** Owns one explicitly selected browser-folder snapshot and reads only the nearest bounded region files as the camera moves. */
export const createRegionFolderViewportSource = ({ files, directorySegments, excludedDirectorySegments = [],
  maxFiles = REGION_SNAPSHOT_FILE_LIMIT, maxBytes = REGION_SNAPSHOT_TOTAL_BYTE_LIMIT }: {
  files: readonly RegionFolderViewportFile[];
  directorySegments: readonly string[];
  excludedDirectorySegments?: readonly (readonly string[])[];
  maxFiles?: number;
  maxBytes?: number;
}): RegionFolderViewportSource => {
  if (!Array.isArray(files) || !files.length || files.length > REGION_FOLDER_FILE_INVENTORY_LIMIT)
    throw new Error("Invalid or oversized region folder inventory.");
  let inventory = [...files];
  const path = [...directorySegments], excluded = excludedDirectorySegments.map(item => [...item]);
  let disposed = false, revision = 0;
  let current: Readonly<RegionFolderViewportSnapshot> | null = null;
  let cache = new Map<string, RegionFolderViewportSnapshotFile>();
  const ensureCurrent = (request: number, signal?: AbortSignal) => {
    if (disposed) throw cancelled("Region folder source is disposed.");
    if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : cancelled("Region folder load was cancelled.");
    if (request !== revision) throw cancelled("Region folder load was superseded.");
  };
  return {
    async load(focus, signal) {
      const focusRegion = regionAt(focus), request = ++revision;
      ensureCurrent(request, signal);
      const selected = selectRegionFolderFiles(inventory, path, focus, maxFiles, maxBytes, excluded);
      const keys = selected.files.map(file => {
        if (!Number.isSafeInteger(file.lastModified) || file.lastModified < 0 || typeof file.arrayBuffer !== "function")
          throw new Error("Invalid region folder file handle.");
        return fileKey(file);
      });
      const selectionKey = JSON.stringify(keys);
      const loaded = await Promise.all(selected.files.map(async (file, index) => {
        const key = keys[index], retained = cache.get(key);
        if (retained) return retained;
        const buffer = await file.arrayBuffer();
        ensureCurrent(request, signal);
        if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== file.size)
          throw new Error("Region folder file changed while its snapshot was being read.");
        return Object.freeze({ name: file.name, bytes: new Uint8Array(buffer.slice(0)), lastModified: file.lastModified });
      }));
      ensureCurrent(request, signal);
      cache = new Map(keys.map((key, index) => [key, loaded[index]]));
      current = Object.freeze({ files: Object.freeze(loaded), focus: Object.freeze({ ...focus }),
        focusRegion: Object.freeze(focusRegion), matchedFiles: selected.matchedFiles,
        folderLabel: selected.folderLabel, selectionKey });
      return current;
    },
    needsLoad(focus) {
      if (disposed) return false;
      const region = regionAt(focus);
      return !current || current.focusRegion.x !== region.x || current.focusRegion.z !== region.z;
    },
    getSnapshot: () => current,
    dispose() {
      if (disposed) return;
      disposed = true; revision++; inventory = []; cache.clear(); current = null;
    },
  };
};
