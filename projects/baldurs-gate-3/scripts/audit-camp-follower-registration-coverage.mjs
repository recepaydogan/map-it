import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Inventory source registrations independently of the destination producer.
// An unmatched registration is a review candidate, not proof of reachability.
const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 6, "Usage: audit-camp-follower-registration-coverage.mjs <stage> <scene-recipe> <resident-recipe> <fresh-report>");
const [stage, sceneRecipePath, residentRecipePath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const relativeOutput = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(relativeOutput && !relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput) && !fs.existsSync(output));
const hashes = {};
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), key = path.relative(root, absolute).replaceAll("\\", "/");
  const hash = createHash("sha256").update(data).digest("hex");
  assert(!hashes[key] || hashes[key] === hash); hashes[key] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file));
const manifest = read(path.join(stage, "stage-manifest.json")), sceneRecipe = read(sceneRecipePath), residentRecipe = read(residentRecipePath);
const source = read(manifest.storyLocationsPath), sources = [...new Set(residentRecipe.residents.flatMap((resident) => resident.registrationSources))];
const actors = new Set(sceneRecipe.profiles.map(({ characterContentId }) => characterContentId));
const appearances = manifest.maps.flatMap((mapId) => read(path.join(stage, `public/maps/${mapId}/content.json`)).entities.map((entity) => ({ mapId, entity })));
const uuid = "[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}";
const pattern = new RegExp(`^DB_ORI_OriginCampData\\([^,]*?(${uuid})\\s*,\\s*"([^"]+)"\\s*,[^,]*?(${uuid})\\s*\\);$`, "i");
const entries = [];
for (const file of sources) {
  const lines = bytes(file).toString("utf8").split(/\r?\n/), end = lines.indexOf("KBSECTION");
  assert(end > 0);
  for (let index = 0; index < end; index++) {
    const line = lines[index].replace(/\/\/.*$/, "").trim();
    if (!line.startsWith("DB_ORI_OriginCampData(")) continue;
    const match = line.match(pattern); assert(match, `Unparsed native registration: ${file}:${index + 1}`);
    const [, characterContentId, camp, anchorContentId] = match;
    if (!actors.has(characterContentId)) continue;
    const relations = source.scriptedDestinations.filter((row) => row.character.id === characterContentId && row.anchor.id === anchorContentId);
    const selected = appearances.filter(({ entity }) => entity.storyDestination?.characterContentId === characterContentId && entity.storyDestination?.anchorContentId === anchorContentId);
    const alternate = appearances.filter(({ entity }) => entity.storyDestination?.characterContentId === characterContentId
      && entity.storyDestination?.alternateDestinations?.some((row) => row.anchorContentId === anchorContentId));
    entries.push({ characterContentId, camp, anchorContentId, evidence: { sourcePath: file, sourceLine: index + 1, statement: line.slice(0, -1) },
      relationIds: relations.map(({ id }) => id), selectedAppearances: selected.map(({ mapId, entity }) => ({ mapId, id: entity.id, sceneId: entity.sceneContext?.id })),
      alternateAppearances: alternate.map(({ mapId, entity }) => ({ mapId, id: entity.id })),
      status: selected.length ? "selected-resident-anchor-needs-scene-review" : "registration-without-selected-anchor-needs-reachability-review" });
  }
}
assert(entries.length && new Set(entries.map((row) => `${row.characterContentId}/${row.anchorContentId}`)).size === entries.length);
const byActor = [...actors].map((characterContentId) => {
  const rows = entries.filter((row) => row.characterContentId === characterContentId);
  return { characterContentId, registrations: rows.length, sourceRelations: rows.filter((row) => row.relationIds.length).length,
    selected: rows.filter((row) => row.selectedAppearances.length).length,
    unselected: rows.filter((row) => !row.selectedAppearances.length).length };
});
bytes(import.meta.filename);
for (const [file, hash] of Object.entries(hashes)) assert.equal(createHash("sha256").update(fs.readFileSync(path.resolve(root, file))).digest("hex"), hash);
const report = { kind: "native-follower-registration-coverage", stage, sources, byActor, entries, hashes,
  scope: "Exact INIT follower registrations for scene-recipe actors, compared with the current destination catalog and regional selected/alternate anchors. Reachability, recruitment guards, disabled camps and normal runtime routing must be reviewed before adding any pin. Not a missing-map count or whole-game completeness claim." };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ byActor, registrations: entries.length, output }, null, 2));
