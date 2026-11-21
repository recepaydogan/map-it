import { parseRegionSnapshotName } from "./region-snapshot-plan.ts";
import { REGION_FOLDER_FILE_INVENTORY_LIMIT, type RegionFolderViewportFile } from "./region-folder-viewport-source.ts";

export type TerrainDirectoryPermission = "granted" | "denied" | "prompt";
export interface TerrainFileHandleLike { kind: "file"; name: string; getFile: () => Promise<File> }
export interface TerrainDirectoryHandleLike {
  kind: "directory";
  name: string;
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<TerrainDirectoryHandleLike>;
  entries: () => AsyncIterableIterator<[string, TerrainFileHandleLike | TerrainDirectoryHandleLike]>;
  queryPermission?: (descriptor: { mode: "read" }) => Promise<TerrainDirectoryPermission>;
  requestPermission?: (descriptor: { mode: "read" }) => Promise<TerrainDirectoryPermission>;
}

export const isTerrainDirectoryHandle = (value: unknown): value is TerrainDirectoryHandleLike => {
  if (!value || typeof value !== "object") return false;
  const handle = value as Partial<TerrainDirectoryHandleLike>;
  return handle.kind === "directory" && typeof handle.name === "string" && handle.name.length > 0 && handle.name.length <= 255 &&
    typeof handle.getDirectoryHandle === "function" && typeof handle.entries === "function";
};

export const queryTerrainDirectoryPermission = async (handle: TerrainDirectoryHandleLike): Promise<TerrainDirectoryPermission> => {
  if (!isTerrainDirectoryHandle(handle) || typeof handle.queryPermission !== "function") return "prompt";
  const permission = await handle.queryPermission({ mode: "read" });
  return ["granted", "denied", "prompt"].includes(permission) ? permission : "denied";
};

export const requestTerrainDirectoryPermission = async (handle: TerrainDirectoryHandleLike): Promise<TerrainDirectoryPermission> => {
  if (!isTerrainDirectoryHandle(handle) || typeof handle.requestPermission !== "function") return "denied";
  const permission = await handle.requestPermission({ mode: "read" });
  return ["granted", "denied", "prompt"].includes(permission) ? permission : "denied";
};

/** Reads only the configured dimension's region directory after an explicit browser permission grant. */
export const readRegionDirectoryHandle = async (root: TerrainDirectoryHandleLike, directorySegments: readonly string[],
  signal?: AbortSignal): Promise<readonly RegionFolderViewportFile[]> => {
  if (!isTerrainDirectoryHandle(root) || !directorySegments.length || directorySegments.some(segment => !segment || segment.includes("/") || segment.includes("\\")))
    throw new Error("Invalid region directory handle request.");
  let directory = root;
  for (const segment of directorySegments) {
    if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Region directory read cancelled.");
    directory = await directory.getDirectoryHandle(segment, { create: false });
    if (!isTerrainDirectoryHandle(directory)) throw new Error("Invalid nested region directory handle.");
  }
  const files: RegionFolderViewportFile[] = [];
  for await (const [name, handle] of directory.entries()) {
    if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Region directory read cancelled.");
    if (!parseRegionSnapshotName(name) || handle.kind !== "file" || handle.name !== name || typeof handle.getFile !== "function") continue;
    if (files.length >= REGION_FOLDER_FILE_INVENTORY_LIMIT) throw new Error("Region directory inventory exceeds the configured limit.");
    const file = await handle.getFile();
    if (file.name !== name || !Number.isSafeInteger(file.size) || !Number.isSafeInteger(file.lastModified) || file.lastModified < 0)
      throw new Error("Invalid region file returned by directory handle.");
    files.push({ name, size: file.size, lastModified: file.lastModified,
      webkitRelativePath: [root.name, ...directorySegments, name].join("/"), arrayBuffer: () => file.arrayBuffer() });
  }
  if (!files.length) throw new Error("The authorized directory contains no region files for the active dimension.");
  return files.sort((left, right) => left.name.localeCompare(right.name, "en"));
};
