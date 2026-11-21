import assert from "node:assert/strict";
import fs from "node:fs";
import sharp from "sharp";
import { createReviewedDestinationCorrections } from "./lib/reviewed-destination-corrections.mjs";
import { resolveStoryCampDestinations } from "./lib/story-camp-destinations.mjs";
import { createStoryRuleLookup } from "./lib/story-rule-context.mjs";
import { getMapPointInstanceId } from "../src/features/map/map-atlas-projection.ts";
import { COMPLETED_LOCATIONS_STORAGE_KEY, FAVORITES_STORAGE_KEY, NOTES_STORAGE_KEY, migrateSavedMapStorage } from "../src/features/map/saved-map-storage.ts";

const old = { id: "actor:destination:old", storyDestination: { characterContentId: "actor", anchorContentId: "old" } };
const recipe = { contentId: old.id, characterId: "actor", previousAnchorId: "old", sourceMapId: "source", reason: "Source review",
  destinations: [{ mapId: "target", anchorId: "new" }] };
const catalog = { scriptedDestinations: [{ character: { id: "actor" }, anchor: { id: "new" } }] };
const correction = createReviewedDestinationCorrections([recipe], catalog);
assert.equal(correction.covers("source", old), true);
assert.equal(correction.covers("other", old), false);
assert.throws(() => createReviewedDestinationCorrections([recipe], { scriptedDestinations: [] }), /normal-source/);
assert.throws(() => createReviewedDestinationCorrections([recipe, recipe], catalog), /duplicate/);
const before = (map) => map === "source" ? [old] : [];
assert.throws(() => correction.assertRebuildScope(new Set(["source"]), before), /complete correction/);
assert.throws(() => correction.assertRebuildScope(new Set(["target"]), before), /complete correction/);
assert.doesNotThrow(() => correction.assertRebuildScope(new Set(["source", "target"]), before));
assert.throws(() => correction.assertPublished(new Set(["source", "target"]), before), /missing/);
const after = (map) => map === "target" ? [{ ...old, storyDestination: { characterContentId: "actor", anchorContentId: "new" } }] : [];
assert.doesNotThrow(() => correction.assertPublished(new Set(["source", "target"]), after));
assert.doesNotThrow(() => correction.assertRebuildScope(new Set(["target"]), after));

const actor = "(CHARACTER)Actor_11111111-1111-1111-1111-111111111111";
const anchor = "(TRIGGER)Anchor_22222222-2222-2222-2222-222222222222";
const row = { predicate: "DB_CampPositions", section: "init", arguments: ['"CAMP"', anchor, "0"], evidence: { sourcePath: "fixture", sourceLine: 1 } };
const guard = { predicate: row.predicate, section: "kb", arguments: ["_Camp", "_Anchor", "_"], evidence: { sourcePath: "fixture", sourceLine: 4 } };
const action = { predicate: "DB_ORI_OriginCampData", section: "kb", arguments: [actor, "_Camp", "_Anchor"], evidence: { sourcePath: "fixture", sourceLine: 6 } };
const rule = { sourceLine: 2, actionLine: 6, debugOnly: false };
assert.equal(resolveStoryCampDestinations([row, guard, action], () => rule, []).length, 1);
assert.equal(resolveStoryCampDestinations([row, guard, { ...action, negated: true }], () => rule, []).length, 0);
assert.equal(resolveStoryCampDestinations([{ ...row, negated: true }, guard, action], () => rule, []).length, 0);
assert.equal(resolveStoryCampDestinations([row, guard, action], () => ({ ...rule, debugOnly: true }), []).length, 0);
console.log("Reviewed correction safeguards passed: exact source pairs, complete first migration, persistent IDs and normal-only camp bindings.");

if (!process.argv.includes("--unit-only")) {
  const read = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));
  const config = read("map-sources/config/placement-maps.json");
  const source = read(config.storyLocations);
  const current = createReviewedDestinationCorrections(config.scriptedDestinationCorrections, source);
  const readEntities = (map) => Object.values(read(`public/maps/${map}/content.json`).entities);
  const maps = new Set(config.scriptedDestinationCorrections.flatMap((entry) => [entry.sourceMapId, ...entry.destinations.map(({ mapId }) => mapId)]));
  current.assertPublished(maps, readEntities);
  const instances = new Set();
  const lookups = new Map();
  for (const entry of config.scriptedDestinationCorrections) {
    const baseline = read(`map-sources/audits/pre-reviewed-destination-fix/${entry.sourceMapId}/content.json`).entities.find(({ id }) => id === entry.contentId);
    assert.ok(baseline, "Preserve the actual previously published user-data key");
    for (const target of entry.destinations) {
      const entity = readEntities(target.mapId).find(({ id }) => id === baseline.id);
      const anchor = read(`map-sources/catalog/${target.mapId}-placements.json`).records.find(({ id }) => id === target.anchorId);
      assert.deepEqual(entity.worldPosition, anchor.position, "The correction must use the exact native world anchor");
      assert.equal(entity.title, baseline.title);
      if (entry.presentation?.omitGameplay) assert.equal(entity.gameplay, undefined, "Do not publish placeholder stats for transformed scenery");
      const relations = source.scriptedDestinations.filter(({ character, anchor }) => character.id === entry.characterId && anchor.id === target.anchorId);
      const supported = new Set(relations.flatMap(({ evidence }) => evidence.map((item) => `${item.sourcePath}:${item.sourceLine}:${item.statement}`)));
      for (const item of entity.storyDestination.evidence) {
        assert.ok(supported.has(`${item.sourcePath}:${item.sourceLine}:${item.statement}`));
        if (!lookups.has(item.sourcePath)) lookups.set(item.sourcePath, createStoryRuleLookup(fs.readFileSync(item.sourcePath, "utf8")));
        assert.notEqual(lookups.get(item.sourcePath)(item.sourceLine)?.debugOnly, true);
      }
      const marker = read(`public/maps/${target.mapId}/locations.json`).locations.find(({ contentId }) => contentId === entry.contentId);
      const instance = getMapPointInstanceId({ ...marker, mapId: target.mapId });
      assert.ok(!instances.has(instance), "Shared saved identity must not collide in atlas rendering");
      instances.add(instance);
      const metadata = read(`public/maps/${target.mapId}/metadata.json`);
      const bounds = metadata.coordinateReference.worldBounds;
      const x = Math.floor((anchor.position.x - bounds.x) / bounds.width * metadata.tileImageSize.width);
      const y = Math.floor((1 - (anchor.position.z - bounds.y) / bounds.height) * metadata.tileImageSize.height);
      const tile = `public/maps/${target.mapId}/tiles/0/tile${Math.floor(x / metadata.tileSize)}x${Math.floor(y / metadata.tileSize)}.webp`;
      const rgba = await sharp(tile).ensureAlpha().extract({ left: x % metadata.tileSize, top: y % metadata.tileSize, width: 1, height: 1 }).raw().toBuffer();
      assert.ok(rgba[3] > 16, "Corrected anchor must land on original visible map pixels without snapping");
    }
  }
  const keys = config.scriptedDestinationCorrections.map(({ contentId }) => contentId);
  const storage = new Map([[FAVORITES_STORAGE_KEY, JSON.stringify(keys)], [COMPLETED_LOCATIONS_STORAGE_KEY, JSON.stringify(keys)],
    [NOTES_STORAGE_KEY, JSON.stringify(Object.fromEntries(keys.map((key) => [key, "Existing note"])))] ]);
  migrateSavedMapStorage({ getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) });
  for (const key of [FAVORITES_STORAGE_KEY, COMPLETED_LOCATIONS_STORAGE_KEY]) assert.deepEqual(JSON.parse(storage.get(key)), keys);
  assert.deepEqual(Object.keys(JSON.parse(storage.get(NOTES_STORAGE_KEY))), keys);
  console.log("Published corrections passed: native anchors and pixels, source provenance, distinct atlas instances and preserved saved notes/favorites/completion.");
}
