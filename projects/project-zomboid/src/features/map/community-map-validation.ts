import type {
  CommunityMapLocationsFile,
  CommunityMapManifest,
} from "./community-map-types";
import type { MapLocation, MapTown } from "./types";

const MAP_CATEGORIES = new Set([
  "medical",
  "police",
  "fire",
  "fuel",
  "vehicle",
  "supplies",
  "food",
  "industrial",
  "community",
  "lodging",
  "military",
  "weapons",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireRecord = (value: unknown, label: string) => {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
};

const requireString = (value: unknown, label: string, maximum: number) => {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum) {
    throw new Error(`${label} must be a non-empty string of at most ${maximum} characters.`);
  }
  return value;
};

const optionalString = (value: unknown, label: string, maximum: number) => {
  if (value === undefined) return undefined;
  return requireString(value, label, maximum);
};

const requireUrl = (value: unknown, label: string) => {
  const source = requireString(value, label, 500);
  const url = new URL(source);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${label} must use HTTP or HTTPS.`);
  }
  return source;
};

const optionalUrl = (value: unknown, label: string) => {
  if (value === undefined) return undefined;
  return requireUrl(value, label);
};

const requireInteger = (value: unknown, label: string, minimum: number, maximum: number) => {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value as number;
};

const rejectUnknownKeys = (value: Record<string, unknown>, allowed: string[], label: string) => {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unknown) throw new Error(`${label} contains unsupported property "${unknown}".`);
};

export const validateCommunityMapManifest = (value: unknown): CommunityMapManifest => {
  const manifest = requireRecord(value, "Manifest");
  rejectUnknownKeys(manifest, [
    "schemaVersion", "packageType", "id", "version", "displayName", "description",
    "creator", "rights", "supportedGameBuilds", "map",
  ], "Manifest");
  if (manifest.schemaVersion !== 1 || manifest.packageType !== "pzim-community-map") {
    throw new Error("This is not a supported PZIM community map package.");
  }

  const id = requireString(manifest.id, "Package ID", 80);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error("Package ID is not valid.");
  const version = requireString(manifest.version, "Version", 40);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error("Package version is not valid.");

  const creator = requireRecord(manifest.creator, "Creator");
  rejectUnknownKeys(creator, ["name", "sourceUrl"], "Creator");
  const rights = requireRecord(manifest.rights, "Rights");
  rejectUnknownKeys(rights, [
    "license", "licenseUrl", "permissionStatus", "permissionEvidenceUrl", "attribution",
  ], "Rights");
  if (rights.permissionStatus !== "self-authored" && rights.permissionStatus !== "explicit") {
    throw new Error("Rights permission status must be self-authored or explicit.");
  }
  const permissionEvidenceUrl = optionalUrl(rights.permissionEvidenceUrl, "Permission evidence URL");
  if (rights.permissionStatus === "explicit" && !permissionEvidenceUrl) {
    throw new Error("Explicit permission requires an evidence URL.");
  }

  if (!Array.isArray(manifest.supportedGameBuilds) || manifest.supportedGameBuilds.length < 1 || manifest.supportedGameBuilds.length > 20) {
    throw new Error("Supported game builds must contain between 1 and 20 entries.");
  }
  const supportedGameBuilds = manifest.supportedGameBuilds.map((build) => {
    const result = requireString(build, "Game build", 16);
    if (!/^4[12](?:\.\d+){0,2}$/.test(result)) throw new Error(`Unsupported game build "${result}".`);
    return result;
  });
  if (new Set(supportedGameBuilds).size !== supportedGameBuilds.length) {
    throw new Error("Supported game builds must be unique.");
  }

  const map = requireRecord(manifest.map, "Map");
  rejectUnknownKeys(map, [
    "coordinateOffset", "bounds", "tileSize", "detailLevels", "tilePattern", "locationsFile",
  ], "Map");
  const coordinateOffset = requireRecord(map.coordinateOffset, "Coordinate offset");
  rejectUnknownKeys(coordinateOffset, ["x", "y"], "Coordinate offset");
  const bounds = requireRecord(map.bounds, "Bounds");
  rejectUnknownKeys(bounds, ["minX", "minY", "maxX", "maxY"], "Bounds");
  const resolvedBounds = {
    minX: requireInteger(bounds.minX, "Minimum X", -100000, 100000),
    minY: requireInteger(bounds.minY, "Minimum Y", -100000, 100000),
    maxX: requireInteger(bounds.maxX, "Maximum X", -100000, 100000),
    maxY: requireInteger(bounds.maxY, "Maximum Y", -100000, 100000),
  };
  if (resolvedBounds.maxX <= resolvedBounds.minX || resolvedBounds.maxY <= resolvedBounds.minY) {
    throw new Error("Map bounds must have a positive width and height.");
  }
  if (map.tileSize !== 256 && map.tileSize !== 512 && map.tileSize !== 1024) {
    throw new Error("Tile size must be 256, 512 or 1024.");
  }
  if (!Array.isArray(map.detailLevels) || map.detailLevels.length < 1 || map.detailLevels.length > 10) {
    throw new Error("Detail levels must contain between 1 and 10 entries.");
  }
  const detailLevels = map.detailLevels.map((level) => requireInteger(level, "Detail level", 0, 9));
  if (new Set(detailLevels).size !== detailLevels.length) throw new Error("Detail levels must be unique.");
  const tilePattern = requireString(map.tilePattern, "Tile pattern", 240);
  if (!/^tiles\/.*\{level\}.*\{x\}.*\{y\}.*\.(?:png|webp|jpg)$/.test(tilePattern)) {
    throw new Error("Tile pattern must include level, x and y placeholders and a supported image extension.");
  }
  const locationsFile = requireString(map.locationsFile, "Locations file", 160);
  if (!/^[a-zA-Z0-9/_-]+\.json$/.test(locationsFile)) throw new Error("Locations file path is not valid.");

  return {
    schemaVersion: 1,
    packageType: "pzim-community-map",
    id,
    version,
    displayName: requireString(manifest.displayName, "Display name", 120),
    description: optionalString(manifest.description, "Description", 500),
    creator: {
      name: requireString(creator.name, "Creator name", 120),
      sourceUrl: requireUrl(creator.sourceUrl, "Creator source URL"),
    },
    rights: {
      license: requireString(rights.license, "License", 120),
      licenseUrl: optionalUrl(rights.licenseUrl, "License URL"),
      permissionStatus: rights.permissionStatus,
      permissionEvidenceUrl,
      attribution: requireString(rights.attribution, "Attribution", 500),
    },
    supportedGameBuilds,
    map: {
      coordinateOffset: {
        x: requireInteger(coordinateOffset.x, "Coordinate offset X", -100000, 100000),
        y: requireInteger(coordinateOffset.y, "Coordinate offset Y", -100000, 100000),
      },
      bounds: resolvedBounds,
      tileSize: map.tileSize,
      detailLevels,
      tilePattern,
      locationsFile,
    },
  };
};

const validateTown = (value: unknown, index: number, manifest: CommunityMapManifest): MapTown => {
  const town = requireRecord(value, `Town ${index + 1}`);
  rejectUnknownKeys(town, ["id", "name", "x", "y"], `Town ${index + 1}`);
  const x = requireInteger(town.x, `Town ${index + 1} X`, manifest.map.bounds.minX, manifest.map.bounds.maxX);
  const y = requireInteger(town.y, `Town ${index + 1} Y`, manifest.map.bounds.minY, manifest.map.bounds.maxY);
  return {
    id: requireString(town.id, `Town ${index + 1} ID`, 100),
    name: requireString(town.name, `Town ${index + 1} name`, 120),
    x,
    y,
  };
};

const validateLocation = (value: unknown, index: number, manifest: CommunityMapManifest): MapLocation => {
  const location = requireRecord(value, `Location ${index + 1}`);
  rejectUnknownKeys(location, ["id", "name", "category", "label", "subtype", "townId", "town", "x", "y"], `Location ${index + 1}`);
  const category = requireString(location.category, `Location ${index + 1} category`, 40);
  if (!MAP_CATEGORIES.has(category)) throw new Error(`Location ${index + 1} uses unsupported category "${category}".`);
  return {
    id: requireString(location.id, `Location ${index + 1} ID`, 120),
    name: requireString(location.name, `Location ${index + 1} name`, 160),
    category,
    label: requireString(location.label, `Location ${index + 1} label`, 120),
    subtype: requireString(location.subtype, `Location ${index + 1} subtype`, 120),
    townId: requireString(location.townId, `Location ${index + 1} town ID`, 100),
    town: requireString(location.town, `Location ${index + 1} town`, 120),
    x: requireInteger(location.x, `Location ${index + 1} X`, manifest.map.bounds.minX, manifest.map.bounds.maxX),
    y: requireInteger(location.y, `Location ${index + 1} Y`, manifest.map.bounds.minY, manifest.map.bounds.maxY),
  };
};

export const validateCommunityMapLocations = (
  value: unknown,
  manifest: CommunityMapManifest,
): CommunityMapLocationsFile => {
  const source = Array.isArray(value) ? { locations: value } : requireRecord(value, "Locations file");
  rejectUnknownKeys(source, ["towns", "locations"], "Locations file");
  if (!Array.isArray(source.locations) || source.locations.length > 50000) {
    throw new Error("Locations file must contain an array with at most 50,000 locations.");
  }
  if (source.towns !== undefined && (!Array.isArray(source.towns) || source.towns.length > 500)) {
    throw new Error("Towns must be an array with at most 500 entries.");
  }
  const locations = source.locations.map((location, index) => validateLocation(location, index, manifest));
  const towns = (source.towns ?? []).map((town, index) => validateTown(town, index, manifest));
  if (new Set(locations.map(({ id }) => id)).size !== locations.length) throw new Error("Location IDs must be unique.");
  if (new Set(towns.map(({ id }) => id)).size !== towns.length) throw new Error("Town IDs must be unique.");
  return { locations, towns };
};
