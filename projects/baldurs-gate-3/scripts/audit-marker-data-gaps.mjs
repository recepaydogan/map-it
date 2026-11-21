import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const configPath = path.join(projectRoot, "map-sources", "config", "placement-maps.json");
const outputPath = path.join(projectRoot, "map-sources", "catalog", "marker-data-audit.json");
const storyRoot = path.join(projectRoot, "map-sources", "extracted", "story-goals");

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });

const increment = (map, key, amount = 1) => map.set(key, (map.get(key) ?? 0) + amount);
const hasValue = (value) => {
  if (Array.isArray(value)) return value.some(hasValue);
  if (!value || typeof value !== "object") return value !== "" && value !== null && value !== false;
  return Object.values(value).some(hasValue);
};
const sortedCounts = (map) => [...map]
  .map(([name, count]) => ({ name, count }))
  .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "en"));

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const fieldCounts = new Map();
const fieldCountsByKind = new Map();
const relationFieldPattern = /key|lock|owner|parent|target|trigger|trap|difficulty|inventory|loot|treasure|recipe|use|dialog|quest|secret|pickpocket|drop|state|status|teleport|portal|ladder|party|level/i;
const relationFieldCounts = new Map();
const onUseActionTypes = new Map();
const onUseAttributeFields = new Map();
const onUseGuidSamples = new Map();
const onUseFieldSamples = new Map();
const onUseSelectedValueCounts = new Map();
const sampledOnUseFields = new Set(["SecretDoor", "InsertSlots", "CombineSlots", "RecipeID", "ScriptControlledDoor"]);
let placementFiles = 0;
let placementObjects = 0;

for (const relativeRoot of new Set([
  ...Object.values(config.placementRoots),
  ...(config.supplementaryPlacementRoots ?? []),
])) {
  const root = path.join(projectRoot, relativeRoot);
  for (const filePath of walkFiles(root).filter((candidate) => candidate.toLocaleLowerCase("en-US").endsWith(".lsj"))) {
    placementFiles += 1;
    const objects = JSON.parse(fs.readFileSync(filePath, "utf8"))?.save?.regions?.Templates?.GameObjects ?? [];
    const parts = path.relative(root, filePath).split(path.sep);
    const levelsIndex = parts.indexOf("Levels");
    const placementKind = (levelsIndex >= 0 ? parts[levelsIndex + 2] : parts[2] ?? "unknown")
      .toLocaleLowerCase("en-US");
    const countsForKind = fieldCountsByKind.get(placementKind) ?? new Map();
    fieldCountsByKind.set(placementKind, countsForKind);
    for (const object of objects) {
      placementObjects += 1;
      for (const [field, value] of Object.entries(object)) {
        if (!hasValue(value)) continue;
        increment(fieldCounts, field);
        increment(countsForKind, field);
        if (relationFieldPattern.test(field)) increment(relationFieldCounts, field);
      }
      for (const group of object.OnUsePeaceActions ?? []) {
        for (const action of group.Action ?? []) {
          const actionType = String(action.ActionType?.value ?? "unknown");
          increment(onUseActionTypes, actionType);
          for (const attributes of action.Attributes ?? []) {
            for (const [field, value] of Object.entries(attributes)) {
              increment(onUseAttributeFields, field);
              const serialized = JSON.stringify(value);
              if (sampledOnUseFields.has(field)) {
                const valueCounts = onUseSelectedValueCounts.get(field) ?? new Map();
                increment(valueCounts, serialized);
                onUseSelectedValueCounts.set(field, valueCounts);
                const fieldSamples = onUseFieldSamples.get(field) ?? [];
                if (fieldSamples.length < 8) fieldSamples.push({
                  objectId: object.MapKey?.value,
                  internalName: object.Name?.value,
                  actionType,
                  value,
                });
                onUseFieldSamples.set(field, fieldSamples);
              }
              if (!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(serialized)) continue;
              const samples = onUseGuidSamples.get(field) ?? [];
              if (samples.length < 3) samples.push({
                objectId: object.MapKey?.value,
                internalName: object.Name?.value,
                actionType,
                value,
              });
              onUseGuidSamples.set(field, samples);
            }
          }
        }
      }
    }
  }
}

const storyPredicateCounts = new Map();
const storyPredicatesWithGuids = new Map();
let storyFiles = 0;
let storyStatements = 0;
for (const filePath of walkFiles(storyRoot).filter((candidate) => candidate.toLocaleLowerCase("en-US").endsWith(".txt"))) {
  storyFiles += 1;
  const source = fs.readFileSync(filePath, "utf8");
  for (const line of source.split(/\r?\n/)) {
    const statement = line.trim();
    if (!statement || statement.startsWith("//")) continue;
    const predicate = statement.match(/^([A-Za-z][A-Za-z0-9_]*)\s*\(/)?.[1];
    if (!predicate) continue;
    storyStatements += 1;
    increment(storyPredicateCounts, predicate);
    if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(statement)) {
      increment(storyPredicatesWithGuids, predicate);
    }
  }
}

const audit = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  placements: {
    files: placementFiles,
    objects: placementObjects,
    fields: sortedCounts(fieldCounts),
    fieldsByKind: Object.fromEntries([...fieldCountsByKind]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([kind, counts]) => [kind, sortedCounts(counts)])),
    relationshipCandidates: sortedCounts(relationFieldCounts),
    onUseActions: {
      actionTypes: sortedCounts(onUseActionTypes),
      attributeFields: sortedCounts(onUseAttributeFields),
      guidSamples: Object.fromEntries(onUseGuidSamples),
      fieldSamples: Object.fromEntries(onUseFieldSamples),
      selectedValueCounts: Object.fromEntries([...onUseSelectedValueCounts]
        .map(([field, counts]) => [field, sortedCounts(counts)])),
    },
  },
  story: {
    files: storyFiles,
    statements: storyStatements,
    predicates: sortedCounts(storyPredicateCounts),
    predicatesWithGuids: sortedCounts(storyPredicatesWithGuids),
  },
};

fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(`Marker data audit: ${placementObjects} placed objects / ${fieldCounts.size} populated fields; ${storyStatements} story statements / ${storyPredicateCounts.size} predicates.`);
console.log("Top relationship fields:", audit.placements.relationshipCandidates.slice(0, 25).map(({ name, count }) => `${name}=${count}`).join(", "));
console.log("Top GUID story predicates:", audit.story.predicatesWithGuids.slice(0, 25).map(({ name, count }) => `${name}=${count}`).join(", "));
