import { getRuntimeZomboidRootCandidates, joinPath } from "../live-bridge/live-bridge-paths";

const UTF8_ENCODING = "UTF8" as overwolf.io.enums.eEncoding;

export const parseActiveModIds = (content: string) => [...content.matchAll(
  /^\s*mod\s*=\s*([^,\r\n]+),?\s*$/gim,
)].map((match) => match[1]?.trim()).filter((value): value is string => Boolean(value));

const readTextFile = (path: string) => new Promise<string | null>((resolve) => {
  overwolf.io.readFileContents(path, UTF8_ENCODING, (result) => {
    resolve(result.success && typeof result.content === "string" ? result.content : null);
  });
});

const directoryExists = (path: string) => new Promise<boolean>((resolve) => {
  overwolf.io.dir(path, (result) => resolve(result.success));
});

export interface ActiveMapModScan {
  modIds: string[];
  rootPath: string | null;
  sourcePath: string | null;
}

export const scanDefaultActiveMods = async (): Promise<ActiveMapModScan> => {
  if (typeof overwolf === "undefined" || !overwolf.io) {
    return { modIds: [], rootPath: null, sourcePath: null };
  }

  let existingRoot: string | null = null;
  for (const root of getRuntimeZomboidRootCandidates(overwolf.io.paths)) {
    if (!existingRoot && await directoryExists(root)) existingRoot = root;
    const sourcePath = joinPath(root, "mods\\default.txt");
    const content = await readTextFile(sourcePath);
    if (content !== null) {
      return { modIds: parseActiveModIds(content), rootPath: root, sourcePath };
    }
  }
  return { modIds: [], rootPath: existingRoot, sourcePath: null };
};

export const readDefaultActiveModIds = async () => (await scanDefaultActiveMods()).modIds;
