import fs from "node:fs";
import path from "node:path";

const parseArguments = (values) => {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    }
    const name = key.slice(2);
    const existing = result.get(name);
    result.set(name, existing === undefined ? value : Array.isArray(existing) ? [...existing, value] : [existing, value]);
  }
  return result;
};

const readMany = (arguments_, name) => {
  const value = arguments_.get(name);
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map((entry) => path.resolve(entry));
};

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });

const decodeXml = (value) => value
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&quot;", "\"")
  .replaceAll("&apos;", "'")
  .replaceAll("&amp;", "&");

const stripLocalizationMarkup = (value) => decodeXml(value)
  .replace(/<br\s*\/?\s*>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/\s+/g, " ")
  .trim();

const readLocalization = (filePath) => {
  if (!filePath) return new Map();
  const xml = fs.readFileSync(filePath, "utf8");
  return new Map([...xml.matchAll(/<content\s+contentuid="([^"]+)"[^>]*>([\s\S]*?)<\/content>/g)]
    .map((match) => [match[1], stripLocalizationMarkup(match[2])]));
};

const attributeValue = (object, name, fallback = null) => {
  const attribute = object?.[name];
  if (!attribute || Array.isArray(attribute)) return fallback;
  return attribute.value ?? attribute.handle ?? fallback;
};

const parsePosition = (object) => {
  const value = object?.Transform?.[0]?.Position?.value;
  if (typeof value !== "string") return null;
  const coordinates = value.trim().split(/\s+/).map(Number);
  if (coordinates.length !== 3 || coordinates.some((coordinate) => !Number.isFinite(coordinate))) return null;
  return { x: coordinates[0], y: coordinates[1], z: coordinates[2] };
};

const distanceBetween = (left, right) => Math.hypot(
  left.x - right.x,
  left.y - right.y,
  left.z - right.z,
);

const relativeSource = (filePath) => path.relative(process.cwd(), filePath).split(path.sep).join("/");

const arguments_ = parseArguments(process.argv.slice(2));
const storySources = readMany(arguments_, "story-source");
const placementSources = readMany(arguments_, "placement-source");
const waypointLocalizationSources = readMany(arguments_, "waypoint-localization-source");
const outputValue = arguments_.get("output");
if (storySources.length === 0 || placementSources.length === 0 || waypointLocalizationSources.length === 0 || !outputValue) {
  throw new Error("--story-source, --placement-source, --waypoint-localization-source, and --output are required.");
}
const outputPath = path.resolve(outputValue);
const sourceBuild = arguments_.get("source-build") ?? null;
const localization = {
  en: readLocalization(arguments_.get("localization-en") ? path.resolve(arguments_.get("localization-en")) : null),
  tr: readLocalization(arguments_.get("localization-tr") ? path.resolve(arguments_.get("localization-tr")) : null),
};

const registrations = new Map();
const waypointPattern = /DB_WaypointInfo\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*(?:\(ITEM\))?[^,\r\n]*?([0-9a-f]{8}-[0-9a-f-]{27})\s*,\s*(?:\(TRIGGER\))?[^;\r\n]*?([0-9a-f]{8}-[0-9a-f-]{27})\s*\)\s*;/gi;
for (const sourcePath of storySources) {
  const source = fs.readFileSync(sourcePath, "utf8");
  for (const match of source.matchAll(waypointPattern)) {
    const id = match[2];
    if (registrations.has(id)) throw new Error(`Duplicate waypoint registration: ${id}.`);
    const sourceLine = source.slice(0, match.index).split(/\r?\n/).length;
    registrations.set(id, {
      id,
      group: match[1],
      shrineId: match[3].toLocaleLowerCase("en-US"),
      triggerId: match[4].toLocaleLowerCase("en-US"),
      storyProvenance: { sourcePath: relativeSource(sourcePath), sourceLine },
    });
  }
}

const localizationHandles = new Map();
for (const sourcePath of waypointLocalizationSources) {
  const entries = JSON.parse(fs.readFileSync(sourcePath, "utf8"))?.save?.regions?.TranslatedStringKeys?.TranslatedStringKey;
  if (!Array.isArray(entries)) throw new Error(`TranslatedStringKeys were not found in ${sourcePath}.`);
  for (const entry of entries) {
    const id = attributeValue(entry, "UUID");
    const handle = attributeValue(entry, "Content");
    if (id && handle) localizationHandles.set(id, { handle, sourcePath: relativeSource(sourcePath) });
  }
}

const placements = new Map();
let scannedObjectCount = 0;
for (const sourceRoot of placementSources) {
  const files = walkFiles(sourceRoot)
    .filter((filePath) => filePath.toLocaleLowerCase("en-US").endsWith(".lsj"))
    .sort((left, right) => left.localeCompare(right, "en"));
  for (const sourcePath of files) {
    const objects = JSON.parse(fs.readFileSync(sourcePath, "utf8"))?.save?.regions?.Templates?.GameObjects;
    if (!Array.isArray(objects)) throw new Error(`Templates.GameObjects was not found in ${sourcePath}.`);
    for (const object of objects) {
      scannedObjectCount += 1;
      const id = attributeValue(object, "MapKey")?.toLocaleLowerCase("en-US");
      if (!id) continue;
      const position = parsePosition(object);
      placements.set(id, {
        id,
        internalName: attributeValue(object, "Name", ""),
        level: attributeValue(object, "LevelName", ""),
        type: attributeValue(object, "Type", ""),
        position,
        provenance: { sourcePath: relativeSource(sourcePath) },
      });
    }
  }
}

const waypoints = [...registrations.values()]
  .map((registration) => {
    const shrine = placements.get(registration.shrineId);
    const trigger = placements.get(registration.triggerId);
    if (!shrine?.position) throw new Error(`Waypoint shrine placement is missing: ${registration.id} (${registration.shrineId}).`);
    if (!trigger?.position) throw new Error(`Waypoint trigger placement is missing: ${registration.id} (${registration.triggerId}).`);
    if (shrine.level !== trigger.level) {
      throw new Error(`Waypoint shrine and trigger levels differ for ${registration.id}: ${shrine.level} / ${trigger.level}.`);
    }
    const activationDistance = distanceBetween(shrine.position, trigger.position);
    if (activationDistance > 10) throw new Error(`Waypoint shrine and trigger are ${activationDistance.toFixed(2)} units apart: ${registration.id}.`);
    const localized = localizationHandles.get(registration.id);
    if (!localized) throw new Error(`Waypoint localization key is missing: ${registration.id}.`);
    const localizedNames = Object.fromEntries(Object.entries({
      en: localization.en.get(localized.handle),
      tr: localization.tr.get(localized.handle),
    }).filter(([, value]) => value));
    if (!localizedNames.en) throw new Error(`English waypoint localization is missing: ${registration.id} (${localized.handle}).`);
    return {
      ...registration,
      internalName: shrine.internalName,
      level: shrine.level,
      localizedNames,
      localizationHandle: localized.handle,
      position: shrine.position,
      triggerPosition: trigger.position,
      activationDistance: Number(activationDistance.toFixed(3)),
      provenance: {
        story: registration.storyProvenance,
        shrine: shrine.provenance,
        trigger: trigger.provenance,
        localization: { sourcePath: localized.sourcePath },
      },
    };
  })
  .sort((left, right) => left.group.localeCompare(right.group, "en")
    || left.localizedNames.en.localeCompare(right.localizedNames.en, "en"));

const byShrineId = Object.fromEntries(waypoints.map((waypoint) => [waypoint.shrineId, waypoint.id]));
const byLevel = Object.fromEntries([...new Set(waypoints.map((waypoint) => waypoint.level))]
  .sort((left, right) => left.localeCompare(right, "en"))
  .map((level) => [level, waypoints.filter((waypoint) => waypoint.level === level).map((waypoint) => waypoint.id)]));
const groupCounts = Object.fromEntries([...new Set(waypoints.map((waypoint) => waypoint.group))]
  .sort((left, right) => left.localeCompare(right, "en"))
  .map((group) => [group, waypoints.filter((waypoint) => waypoint.group === group).length]));

const catalog = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceBuild,
  stats: {
    waypoints: waypoints.length,
    storySources: storySources.length,
    placementSources: placementSources.length,
    waypointLocalizationSources: waypointLocalizationSources.length,
    scannedObjects: scannedObjectCount,
    localizedEnglish: waypoints.filter((waypoint) => waypoint.localizedNames.en).length,
    localizedTurkish: waypoints.filter((waypoint) => waypoint.localizedNames.tr).length,
    groupCounts,
  },
  waypoints,
  byShrineId,
  byLevel,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Built ${waypoints.length} official waypoint registrations across ${Object.keys(byLevel).length} levels.`);
