import type { LevelDbFolderFile } from "./load-leveldb-folder-snapshot.ts";
import { isTerrainDirectoryHandle, type TerrainDirectoryHandleLike } from "./read-region-directory-handle.ts";

const LEVELDB_FILE_INVENTORY_LIMIT = 8_192;
const acceptedFileName = (name: string) => name.toLocaleLowerCase("en-US") === "current"
  || /^manifest-\d+$/i.test(name) || /^\d+\.(?:ldb|sst|log)$/i.test(name);

/** Inventories only the db directory inside an explicitly authorized Bedrock world folder. */
export const readLevelDbDirectoryHandle = async (root: TerrainDirectoryHandleLike,
  signal?: AbortSignal): Promise<readonly LevelDbFolderFile[]> => {
  if (!isTerrainDirectoryHandle(root)) throw new Error("Invalid LevelDB directory handle request.");
  signal?.throwIfAborted();
  const directory = await root.getDirectoryHandle("db", { create: false });
  if (!isTerrainDirectoryHandle(directory)) throw new Error("Invalid LevelDB db directory handle.");
  const files: LevelDbFolderFile[] = [];
  for await (const [name, handle] of directory.entries()) {
    signal?.throwIfAborted();
    if (!acceptedFileName(name) || handle.kind !== "file" || handle.name !== name || typeof handle.getFile !== "function") continue;
    if (files.length >= LEVELDB_FILE_INVENTORY_LIMIT) throw new Error("LevelDB directory inventory exceeds the configured limit.");
    const file = await handle.getFile();
    if (file.name !== name || !Number.isSafeInteger(file.size) || file.size < 1 || !Number.isSafeInteger(file.lastModified)
      || file.lastModified < 0) throw new Error("Invalid LevelDB file returned by directory handle.");
    files.push({ name, size: file.size, lastModified: file.lastModified,
      webkitRelativePath: `${root.name}/db/${name}`, arrayBuffer: () => file.arrayBuffer() });
  }
  if (!files.some(file => file.name.toLocaleLowerCase("en-US") === "current")
    || !files.some(file => /^manifest-\d+$/i.test(file.name)))
    throw new Error("The authorized directory is not a readable Bedrock LevelDB world.");
  return Object.freeze(files.sort((left, right) => left.name.localeCompare(right.name, "en")));
};
