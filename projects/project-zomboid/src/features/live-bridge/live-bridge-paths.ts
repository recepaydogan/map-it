export const ZOMBOID_ROOT_STORAGE_KEY = "pzim:zomboid-root";

const normalizePath = (value: string) => value
  .replace(/^file:\/\//i, "")
  .replace(/\//g, "\\")
  .replace(/[\\/]+$/, "");

export const parentPath = (value: string) => normalizePath(value).replace(/[\\/][^\\/]+$/, "");

export const joinPath = (base: string, suffix: string) => `${normalizePath(base)}\\${suffix}`;

interface WindowsKnownPaths {
  documents?: string;
  localAppData?: string;
}

export const getZomboidRootCandidates = ({ documents, localAppData }: WindowsKnownPaths) => {
  const candidates: string[] = [];
  let profile: string | null = null;

  if (localAppData) {
    profile = parentPath(parentPath(localAppData));
    candidates.push(joinPath(profile, "Zomboid"));
  }

  if (documents) {
    candidates.push(joinPath(documents, "Zomboid"));
    const documentsParent = parentPath(documents);
    candidates.push(joinPath(documentsParent, "Zomboid"));
    if (!profile) candidates.push(joinPath(parentPath(documentsParent), "Zomboid"));
  }

  return [...new Set(candidates)];
};

export const readConfiguredZomboidRoot = () => {
  if (typeof localStorage === "undefined") return null;
  const stored = localStorage.getItem(ZOMBOID_ROOT_STORAGE_KEY);
  return stored ? normalizePath(stored) : null;
};

export const saveConfiguredZomboidRoot = (path: string) => {
  const normalized = normalizePath(path);
  localStorage.setItem(ZOMBOID_ROOT_STORAGE_KEY, normalized);
  return normalized;
};

export const getRuntimeZomboidRootCandidates = (paths: WindowsKnownPaths) => {
  const configured = readConfiguredZomboidRoot();
  return [...new Set([
    ...(configured ? [configured] : []),
    ...getZomboidRootCandidates(paths),
  ])];
};

export const getLiveBridgeFileCandidates = (relativePath: string) =>
  getRuntimeZomboidRootCandidates(overwolf.io.paths)
    .map((root) => joinPath(root, `Lua\\${relativePath}`));
