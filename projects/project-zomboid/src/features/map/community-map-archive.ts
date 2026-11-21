import { unzipSync } from "fflate";
import type {
  CommunityMapAsset,
  CommunityMapManifest,
  PreparedCommunityMapPackage,
} from "./community-map-types";
import { validateCommunityMapLocations, validateCommunityMapManifest } from "./community-map-validation.ts";
import type { MapLocation, MapMetadata, MapTown } from "./types";

const MAX_ARCHIVE_BYTES = 120 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 180 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 16 * 1024 * 1024;
const MAX_FILE_COUNT = 8000;
const MAX_COMPRESSION_RATIO = 200;
const MAX_JSON_BYTES = 5 * 1024 * 1024;

interface ZipDirectoryEntry {
  path: string;
  compressedBytes: number;
  uncompressedBytes: number;
  directory: boolean;
  symbolicLink: boolean;
}

const readJson = (bytes: Uint8Array, label: string) => {
  if (bytes.byteLength > MAX_JSON_BYTES) throw new Error(`${label} is too large.`);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new Error(`${label} is not valid UTF-8 JSON.`);
  }
};

const validateArchivePath = (path: string) => {
  if (!path || path.length > 260 || path.includes("\\") || path.includes("\0") || path.startsWith("/") || /^[a-zA-Z]:/.test(path)) {
    throw new Error(`Unsafe archive path "${path}".`);
  }
  const segments = path.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`Archive path traversal is not allowed: "${path}".`);
  }
};

const inspectZipDirectory = (source: ArrayBuffer): ZipDirectoryEntry[] => {
  if (source.byteLength > MAX_ARCHIVE_BYTES) throw new Error("Map package is larger than 120 MB.");
  const bytes = new Uint8Array(source);
  const view = new DataView(source);
  const minimumOffset = Math.max(0, bytes.length - 65_557);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("Map package is not a valid ZIP archive.");
  const entryCount = view.getUint16(endOffset + 10, true);
  const directoryOffset = view.getUint32(endOffset + 16, true);
  if (entryCount === 0xffff || directoryOffset === 0xffffffff) throw new Error("ZIP64 packages are not supported.");
  if (entryCount < 1 || entryCount > MAX_FILE_COUNT) throw new Error(`Map package must contain between 1 and ${MAX_FILE_COUNT} files.`);

  const decoder = new TextDecoder("utf-8");
  const entries: ZipDirectoryEntry[] = [];
  let offset = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Map package ZIP directory is damaged.");
    }
    const compressedBytes = view.getUint32(offset + 20, true);
    const uncompressedBytes = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > bytes.length) throw new Error("Map package contains a damaged file name.");
    const path = decoder.decode(bytes.subarray(nameStart, nameEnd));
    validateArchivePath(path);
    const directory = path.endsWith("/");
    const unixMode = externalAttributes >>> 16;
    const symbolicLink = (unixMode & 0xf000) === 0xa000;
    if (!directory && uncompressedBytes > MAX_SINGLE_FILE_BYTES) throw new Error(`File "${path}" is larger than 16 MB.`);
    if (!directory && compressedBytes > 0 && uncompressedBytes / compressedBytes > MAX_COMPRESSION_RATIO) {
      throw new Error(`File "${path}" has an unsafe compression ratio.`);
    }
    entries.push({ path, compressedBytes, uncompressedBytes, directory, symbolicLink });
    offset = nameEnd + extraLength + commentLength;
  }

  if (entries.some(({ symbolicLink }) => symbolicLink)) throw new Error("Symbolic links are not allowed in map packages.");
  const totalBytes = entries.reduce((sum, entry) => sum + entry.uncompressedBytes, 0);
  if (totalBytes > MAX_UNCOMPRESSED_BYTES) throw new Error("Map package expands beyond the 180 MB safety limit.");
  return entries;
};

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const createTilePathPattern = (pattern: string) => {
  for (const placeholder of ["{level}", "{x}", "{y}"]) {
    if (pattern.split(placeholder).length !== 2) throw new Error(`Tile pattern must contain ${placeholder} exactly once.`);
  }
  const expression = escapePattern(pattern)
    .replace("\\{level\\}", "(?<level>\\d+)")
    .replace("\\{x\\}", "(?<x>\\d+)")
    .replace("\\{y\\}", "(?<y>\\d+)");
  return new RegExp(`^${expression}$`);
};

const getImageMimeType = (path: string, bytes: Uint8Array) => {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  if (extension === ".png" && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (extension === ".jpg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    extension === ".webp" &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) return "image/webp";
  throw new Error(`Tile "${path}" does not match its declared image format.`);
};

const deriveTowns = (locations: MapLocation[]): MapTown[] => {
  const grouped = new Map<string, MapLocation[]>();
  for (const location of locations) {
    const group = grouped.get(location.townId) ?? [];
    group.push(location);
    grouped.set(location.townId, group);
  }
  return [...grouped.entries()].map(([id, group]) => ({
    id,
    name: group[0]!.town,
    x: Math.round(group.reduce((sum, location) => sum + location.x, 0) / group.length),
    y: Math.round(group.reduce((sum, location) => sum + location.y, 0) / group.length),
  }));
};

const createMetadata = (
  manifest: CommunityMapManifest,
  packageKey: string,
  rawLocations: MapLocation[],
  rawTowns: MapTown[],
): MapMetadata => {
  const { x: offsetX, y: offsetY } = manifest.map.coordinateOffset;
  const locations = rawLocations.map((location) => ({
    ...location,
    id: `${manifest.id}:${location.id}`,
    townId: `${manifest.id}:${location.townId}`,
    x: location.x + offsetX,
    y: location.y + offsetY,
  }));
  const towns = (rawTowns.length > 0 ? rawTowns : deriveTowns(rawLocations)).map((town) => ({
    ...town,
    id: `${manifest.id}:${town.id}`,
    x: town.x + offsetX,
    y: town.y + offsetY,
  }));
  return {
    id: `community:${packageKey}`,
    displayName: manifest.displayName,
    description: manifest.description,
    schemaVersion: 1,
    gameBuild: manifest.supportedGameBuilds.join("/"),
    generatedAt: new Date().toISOString(),
    source: manifest.creator.sourceUrl,
    bounds: {
      minX: manifest.map.bounds.minX + offsetX,
      minY: manifest.map.bounds.minY + offsetY,
      maxX: manifest.map.bounds.maxX + offsetX,
      maxY: manifest.map.bounds.maxY + offsetY,
    },
    tileSize: manifest.map.tileSize,
    detailLevels: [...manifest.map.detailLevels].sort((left, right) => left - right),
    towns,
    locations,
    statistics: { towns: towns.length, searchableLocations: locations.length },
    attribution: manifest.rights.attribution,
    creator: manifest.creator.name,
    tileSource: {
      kind: "community",
      packageKey,
      tilePattern: manifest.map.tilePattern,
    },
  };
};

export const prepareCommunityMapPackage = (source: ArrayBuffer): PreparedCommunityMapPackage => {
  const directoryEntries = inspectZipDirectory(source);
  const files = unzipSync(new Uint8Array(source));
  const fileEntries = directoryEntries.filter(({ directory }) => !directory);
  const manifestCandidates = fileEntries.filter(({ path }) => path === "manifest.json" || path.endsWith("/manifest.json"));
  if (manifestCandidates.length !== 1) throw new Error("Map package must contain exactly one manifest.json file.");
  const manifestArchivePath = manifestCandidates[0]!.path;
  const rootPrefix = manifestArchivePath.slice(0, -"manifest.json".length);
  if (fileEntries.some(({ path }) => !path.startsWith(rootPrefix))) {
    throw new Error("Every package file must be inside the manifest package root.");
  }

  const relativeFiles = new Map<string, Uint8Array>();
  for (const entry of fileEntries) {
    const relativePath = entry.path.slice(rootPrefix.length);
    validateArchivePath(relativePath);
    if (!/\.(?:json|png|webp|jpg)$/i.test(relativePath)) throw new Error(`Unsupported file type: "${relativePath}".`);
    const contents = files[entry.path];
    if (!contents || contents.byteLength !== entry.uncompressedBytes) throw new Error(`Could not safely read "${relativePath}".`);
    relativeFiles.set(relativePath, contents);
  }

  const manifest = validateCommunityMapManifest(readJson(relativeFiles.get("manifest.json")!, "Manifest"));
  const locationsBytes = relativeFiles.get(manifest.map.locationsFile);
  if (!locationsBytes) throw new Error(`Locations file "${manifest.map.locationsFile}" is missing.`);
  const locations = validateCommunityMapLocations(readJson(locationsBytes, "Locations file"), manifest);
  const tilePathPattern = createTilePathPattern(manifest.map.tilePattern);
  const packageKey = `${manifest.id}@${manifest.version}`;
  const assets: CommunityMapAsset[] = [];

  for (const [path, contents] of relativeFiles) {
    if (path === "manifest.json" || path === manifest.map.locationsFile) continue;
    const match = tilePathPattern.exec(path);
    if (!match) throw new Error(`File "${path}" is not declared by the tile pattern.`);
    const level = Number(match.groups?.level);
    if (!manifest.map.detailLevels.includes(level)) throw new Error(`Tile "${path}" uses undeclared detail level ${level}.`);
    const mimeType = getImageMimeType(path, contents);
    assets.push({
      key: `${packageKey}/${path}`,
      packageKey,
      path,
      blob: new Blob([contents.slice().buffer], { type: mimeType }),
    });
  }
  if (assets.length === 0) throw new Error("Map package does not contain any declared tiles.");

  const uncompressedBytes = fileEntries.reduce((sum, entry) => sum + entry.uncompressedBytes, 0);
  return {
    record: {
      key: packageKey,
      manifest,
      metadata: createMetadata(manifest, packageKey, locations.locations, locations.towns ?? []),
      installedAt: new Date().toISOString(),
      assetCount: assets.length,
      uncompressedBytes,
    },
    assets,
  };
};
