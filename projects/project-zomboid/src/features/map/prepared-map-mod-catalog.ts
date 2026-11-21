import type { MapIsometricFloor, MapIsometricInfo, MapIsometricManifest } from "./map-isometric-types";
import { cleanMapDisplayName } from "./map-display-name";
import type { PreparedMapMod, PreparedMapModCatalog, PreparedMapModOverlay } from "./prepared-map-mod-types";

const LOCAL_CATALOG_URL = "/map-data/knox-country/isometric-mods-v2/catalog.json";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireRecord = (value: unknown, label: string) => {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
};

const requireString = (value: unknown, label: string) => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value;
};

const requireInteger = (value: unknown, label: string) => {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer.`);
  return value as number;
};

const requireIntegerTuple = (value: unknown, label: string): [number, number, number, number] => {
  if (!Array.isArray(value) || value.length !== 4) throw new Error(`${label} must contain four integers.`);
  return value.map((entry, index) => requireInteger(entry, `${label}.${index}`)) as [number, number, number, number];
};

const requireIntegerPair = (value: unknown, label: string): [number, number] => {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`${label} must contain two integers.`);
  return value.map((entry, index) => requireInteger(entry, `${label}.${index}`)) as [number, number];
};

const resolveCatalogPath = (value: unknown, label: string, catalogUrl: string) => {
  const path = requireString(value, label).replace(/^\.\//, "");
  if (path.startsWith("/") || path.split("/").includes("..") || /^[a-z]+:/i.test(path)) {
    throw new Error(`${label} must stay inside the prepared mod catalog.`);
  }
  return `${catalogUrl.slice(0, catalogUrl.lastIndexOf("/"))}/${path}`;
};

const parseMapInfo = (value: unknown, label: string): MapIsometricInfo => {
  const info = requireRecord(value, label);
  return {
    w: requireInteger(info.w, `${label}.w`),
    h: requireInteger(info.h, `${label}.h`),
    x0: requireInteger(info.x0, `${label}.x0`),
    y0: requireInteger(info.y0, `${label}.y0`),
    sqr: requireInteger(info.sqr, `${label}.sqr`),
    scale: requireInteger(info.scale, `${label}.scale`),
    minlayer: requireInteger(info.minlayer, `${label}.minlayer`),
    maxlayer: requireInteger(info.maxlayer, `${label}.maxlayer`),
    cell_size: requireInteger(info.cell_size, `${label}.cell_size`),
    cell_rects: Array.isArray(info.cell_rects)
      ? info.cell_rects.map((rectangle, index) => requireIntegerTuple(rectangle, `${label}.cell_rects.${index}`))
      : undefined,
  };
};

const parseFloor = (value: unknown, label: string): MapIsometricFloor => {
  const floor = requireRecord(value, label);
  if (!Array.isArray(floor.levels)) throw new Error(`${label}.levels must be an array.`);
  const tileRanges = floor.tileRanges === undefined
    ? undefined
    : Object.fromEntries(Object.entries(requireRecord(floor.tileRanges, `${label}.tileRanges`)).map(([level, ranges]) => {
      if (!Array.isArray(ranges)) throw new Error(`${label}.tileRanges.${level} must be an array.`);
      return [level, ranges.map((range, index) => {
        if (!Array.isArray(range) || range.length !== 3) {
          throw new Error(`${label}.tileRanges.${level}.${index} must contain three integers.`);
        }
        return range.map((entry, entryIndex) =>
          requireInteger(entry, `${label}.tileRanges.${level}.${index}.${entryIndex}`)) as [number, number, number];
      })];
    }));
  return {
    floor: requireInteger(floor.floor, `${label}.floor`),
    tileSize: requireInteger(floor.tileSize, `${label}.tileSize`),
    format: requireString(floor.format, `${label}.format`),
    width: requireInteger(floor.width, `${label}.width`),
    height: requireInteger(floor.height, `${label}.height`),
    levels: floor.levels.map((level, index) => requireInteger(level, `${label}.levels.${index}`)),
    ...(floor.pyramidMaximumLevel === undefined
      ? {}
      : { pyramidMaximumLevel: requireInteger(floor.pyramidMaximumLevel, `${label}.pyramidMaximumLevel`) }),
    ...(tileRanges ? { tileRanges } : {}),
  };
};

const parseSource = (value: unknown, label: string, catalogUrl: string): MapIsometricManifest => {
  const source = requireRecord(value, label);
  if (!Array.isArray(source.floors) || source.floors.length === 0) throw new Error(`${label}.floors must not be empty.`);
  return {
    id: requireString(source.id, `${label}.id`),
    basePath: resolveCatalogPath(source.basePath, `${label}.basePath`, catalogUrl).replace(/\/$/, ""),
    tileSourceKind: source.tileSourceKind === "dzi" ? "dzi" : "direct",
    renderer: requireString(source.renderer, `${label}.renderer`),
    rendererCommit: requireString(source.rendererCommit, `${label}.rendererCommit`),
    sourceFingerprint: typeof source.sourceFingerprint === "string" ? source.sourceFingerprint : undefined,
    generatedAt: requireString(source.generatedAt, `${label}.generatedAt`),
    cellRange: requireIntegerTuple(source.cellRange, `${label}.cellRange`),
    layerRange: requireIntegerPair(source.layerRange, `${label}.layerRange`),
    complete: source.complete === true,
    mapInfo: parseMapInfo(source.mapInfo, `${label}.mapInfo`),
    floors: source.floors.map((floor, index) => parseFloor(floor, `${label}.floors.${index}`)),
  };
};

const parseOverlay = (value: unknown, label: string, catalogUrl: string): PreparedMapModOverlay => {
  const overlay = requireRecord(value, label);
  if (!Array.isArray(overlay.cells) || overlay.cells.some((cell) => typeof cell !== "string")) {
    throw new Error(`${label}.cells must be a string array.`);
  }
  return {
    mapFolder: requireString(overlay.mapFolder, `${label}.mapFolder`),
    cells: [...overlay.cells] as string[],
    source: parseSource(overlay.source, `${label}.source`, catalogUrl),
  };
};

const parseMod = (value: unknown, index: number, catalogUrl: string): PreparedMapMod => {
  const label = `Prepared mod ${index}`;
  const mod = requireRecord(value, label);
  if (!Array.isArray(mod.builds) || mod.builds.some((build) => typeof build !== "string")) {
    throw new Error(`${label}.builds must be a string array.`);
  }
  if (!Array.isArray(mod.overlays) || mod.overlays.length === 0) throw new Error(`${label}.overlays must not be empty.`);
  if (mod.kind !== "add-on" && mod.kind !== "replacement") throw new Error(`${label}.kind is invalid.`);
  return {
    key: requireString(mod.key, `${label}.key`),
    modId: requireString(mod.modId, `${label}.modId`),
    displayName: cleanMapDisplayName(requireString(mod.displayName, `${label}.displayName`)),
    workshopId: typeof mod.workshopId === "string" ? mod.workshopId : undefined,
    builds: [...mod.builds] as string[],
    kind: mod.kind,
    sourceFingerprint: requireString(mod.sourceFingerprint, `${label}.sourceFingerprint`),
    generatedAt: requireString(mod.generatedAt, `${label}.generatedAt`),
    dataUrl: mod.dataPath === undefined
      ? undefined
      : resolveCatalogPath(mod.dataPath, `${label}.dataPath`, catalogUrl),
    overlays: mod.overlays.map((overlay, overlayIndex) =>
      parseOverlay(overlay, `${label}.overlays.${overlayIndex}`, catalogUrl)),
  };
};

export const parsePreparedMapModCatalog = (
  value: unknown,
  catalogUrl = LOCAL_CATALOG_URL,
): PreparedMapModCatalog => {
  const catalog = requireRecord(value, "Prepared map mod catalog");
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.mods)) {
    throw new Error("Prepared map mod catalog format is not supported.");
  }
  return {
    schemaVersion: 1,
    generatedAt: requireString(catalog.generatedAt, "Prepared map mod catalog generatedAt"),
    mods: catalog.mods.map((mod, index) => parseMod(mod, index, catalogUrl)),
  };
};

export const loadPreparedMapModCatalog = async (signal?: AbortSignal) => {
  const { getMapDataUrl } = await import("./map-data-url");
  const catalogUrl = getMapDataUrl("isometric-mods-v2/catalog.json");
  let response: Response;
  try {
    response = await fetch(catalogUrl, { cache: "no-store", signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    console.info("No prepared map mod catalog is available yet.", error);
    return null;
  }
  if (response.status === 404 || !response.headers.get("content-type")?.includes("application/json")) return null;
  if (!response.ok) throw new Error(`Prepared map mod catalog request failed with ${response.status}.`);
  return parsePreparedMapModCatalog(await response.json(), catalogUrl);
};
