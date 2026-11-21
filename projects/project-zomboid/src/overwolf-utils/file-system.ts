import { isOverwolf } from "../utils/overwolf.ts";

export interface LocalDirectoryEntry {
  name: string;
  type: "dir" | "file";
}

export const normalizeLocalPath = (value: string) => value
  .replace(/^file:\/\//i, "")
  .replace(/\\/g, "/")
  .replace(/\/{2,}/g, "/")
  .replace(/\/$/, "");

export const joinLocalPath = (...parts: string[]) => normalizeLocalPath(
  parts.filter(Boolean).join("/"),
);

export const getLocalPathName = (path: string) => {
  const normalized = normalizeLocalPath(path);
  return normalized.slice(normalized.lastIndexOf("/") + 1);
};

export const getLocalParentPath = (path: string) => {
  const normalized = normalizeLocalPath(path);
  const separator = normalized.lastIndexOf("/");
  return separator > 2 ? normalized.slice(0, separator) : normalized;
};

export const readLocalDirectory = (path: string): Promise<LocalDirectoryEntry[] | null> => {
  if (!isOverwolf() || !overwolf.io?.dir) return Promise.resolve(null);
  return new Promise((resolve) => {
    overwolf.io.dir(normalizeLocalPath(path), (result) => {
      resolve(result.success && result.data ? result.data : null);
    });
  });
};

export const readLocalTextFile = (path: string): Promise<string | null> => {
  if (!isOverwolf() || !overwolf.io?.readTextFile) return Promise.resolve(null);
  return new Promise((resolve) => {
    overwolf.io.readTextFile(
      normalizeLocalPath(path),
      {
        encoding: "UTF8" as overwolf.io.enums.eEncoding,
        maxBytesToRead: 256 * 1024,
        offset: 0,
      },
      (result) => resolve(result.success ? result.content ?? "" : null),
    );
  });
};

export const openLocalFolderPicker = (initialPath: string): Promise<string | null> => {
  if (!isOverwolf() || !overwolf.utils?.openFolderPicker) return Promise.resolve(null);
  return new Promise((resolve) => {
    overwolf.utils.openFolderPicker(initialPath, (result) => {
      resolve(result.success && result.path ? normalizeLocalPath(result.path) : null);
    });
  });
};
