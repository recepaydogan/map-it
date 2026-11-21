import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const stageRoot = path.resolve(root, process.argv[2] ?? "map-sources/audits/staged-gameplay-identity");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const manifest = read(path.join(stageRoot, "stage-manifest.json"));
const omitSearch = ({ searchTerms: ignoredTerms, categoryFacets: ignoredFacets, ...rest }) => { void ignoredTerms; void ignoredFacets; return rest; };
const maps = [];
for (const mapId of manifest.maps) {
  const live = path.join(root, "public/maps", mapId), stage = path.join(stageRoot, "public/maps", mapId);
  const oldContent = read(path.join(live, "content.json")), newContent = read(path.join(stage, "content.json"));
  const oldEntities = new Map(Object.values(oldContent.entities).map((entity) => [entity.id, entity]));
  const newEntities = new Map(Object.values(newContent.entities).map((entity) => [entity.id, entity]));
  const oldLocations = new Map(read(path.join(live, "locations.json")).locations.map((location) => [location.id, location]));
  const newLocations = new Map(read(path.join(stage, "locations.json")).locations.map((location) => [location.id, location]));
  const entityChanges = [], locationChanges = [];
  for (const [id, before] of oldEntities) {
    const after = newEntities.get(id);
    if (!after) continue;
    const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((key) => !isDeepStrictEqual(before[key], after[key]));
    if (fields.length) entityChanges.push({ id, title: before.title, fields,
      before: Object.fromEntries(fields.map((key) => [key, before[key]])), after: Object.fromEntries(fields.map((key) => [key, after[key]])) });
  }
  for (const [id, before] of oldLocations) {
    const after = newLocations.get(id);
    if (after && !isDeepStrictEqual(omitSearch(before), omitSearch(after))) locationChanges.push({ id, before, after });
  }
  maps.push({ mapId, beforeEntities: oldEntities.size, afterEntities: newEntities.size,
    addedEntities: [...newEntities.keys()].filter((id) => !oldEntities.has(id)), removedEntities: [...oldEntities.keys()].filter((id) => !newEntities.has(id)),
    addedLocations: [...newLocations.keys()].filter((id) => !oldLocations.has(id)), removedLocations: [...oldLocations.keys()].filter((id) => !newLocations.has(id)),
    locationChanges, entityChanges,
    hashes: Object.fromEntries(["content.json", "locations.json"].map((file) => [file, { before: hash(path.join(live, file)), after: hash(path.join(stage, file)) }])) });
}
writeGeneratedFile(path.join(stageRoot, "placement-delta.json"), `${JSON.stringify({
  scope: `Staged-versus-published differences (${manifest.kind}). This is not a publication or a source-correctness verdict.`, maps,
}, null, 2)}\n`);
console.log("Staged placement deltas:", maps.map((map) => ({ mapId: map.mapId, added: map.addedEntities.length,
  removed: map.removedEntities.length, locationChanges: map.locationChanges.length, changedEntities: map.entityChanges.length,
  fields: Object.fromEntries([...new Set(map.entityChanges.flatMap(({ fields }) => fields))].map((field) => [field, map.entityChanges.filter(({ fields }) => fields.includes(field)).length])) })));
