import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const inspirationCatalog = JSON.parse(fs.readFileSync(
  path.join(projectRoot, "map-sources", "catalog", "inspiration-events.json"),
  "utf8",
));
const placementCatalog = JSON.parse(fs.readFileSync(
  path.join(projectRoot, "map-sources", "catalog", "wilderness-placements.json"),
  "utf8",
));
const placementRecordsById = new Map((placementCatalog.records ?? [])
  .map((record) => [record.id.toLocaleLowerCase("en-US"), record]));
const mapsRoot = path.join(projectRoot, "public", "maps");
let questLinkedEventCount = 0;
let ruleLinkedEventCount = 0;

assert.ok(inspirationCatalog.stats.highConfidenceRuleAnchoredEvents >= 50);
for (const event of Object.values(inspirationCatalog.events)) {
  if (!event.placementAnchors) continue;
  assert.equal(event.placementAnchors.length, 1, "Automatic story-rule placement must have one unambiguous anchor.");
  const anchor = event.placementAnchors[0];
  const record = placementRecordsById.get(anchor.objectId);
  assert.ok(record?.position, `Inspiration anchor ${anchor.objectId} must have an authored position.`);
  if (record.placementKind !== "items") {
    assert.equal(record.globalPlacement, false, `Movable global ${anchor.objectId} must not anchor an inspiration event.`);
    assert.equal(record.flags?.isGlobal, false, `Global entity ${anchor.objectId} must not anchor an inspiration event.`);
  }
}

for (const directoryEntry of fs.readdirSync(mapsRoot, { withFileTypes: true })) {
  if (!directoryEntry.isDirectory()) continue;
  const mapDirectory = path.join(mapsRoot, directoryEntry.name);
  const contentPath = path.join(mapDirectory, "content.json");
  const locationsPath = path.join(mapDirectory, "locations.json");
  if (!fs.existsSync(contentPath) || !fs.existsSync(locationsPath)) continue;

  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  const locations = JSON.parse(fs.readFileSync(locationsPath, "utf8")).locations ?? [];
  const locationsByContentId = new Map(locations.map((location) => [location.contentId, location]));

  for (const entity of content.entities ?? []) {
    const marker = locationsByContentId.get(entity.id);
    for (const eventProfile of entity.inspirations?.events ?? []) {
      const event = inspirationCatalog.events[eventProfile.id];
      assert.ok(event, `Unknown inspiration event ${eventProfile.id}.`);
      assert.ok(marker?.categoryFacets?.includes("inspiration"));
      assert.ok(Object.values(event.localizedTitles).some((title) => marker?.searchTerms?.includes(title)));
      assert.deepEqual(eventProfile.characters, event.characters);

      const hasDirectObjectEvidence = inspirationCatalog.byObjectId[
        entity.id.toLocaleLowerCase("en-US")
      ]?.includes(eventProfile.id);
      const hasRuleObjectEvidence = inspirationCatalog.byRuleObjectId[
        entity.id.toLocaleLowerCase("en-US")
      ]?.includes(eventProfile.id);
      if (hasRuleObjectEvidence) {
        assert.equal(eventProfile.placementEvidence?.kind, "story-rule");
        assert.equal(eventProfile.placementEvidence?.objectId, entity.id.toLocaleLowerCase("en-US"));
        ruleLinkedEventCount += 1;
        continue;
      }
      if (!event.questUpdates?.length || hasDirectObjectEvidence) continue;
      assert.ok(
        event.questUpdates.some(({ questId }) => questId.toLocaleLowerCase("en-US") === entity.statsId?.toLocaleLowerCase("en-US")),
        `Quest-triggered inspiration ${eventProfile.id} must use an exact stats-to-quest match.`,
      );
      questLinkedEventCount += 1;
    }
  }
}

assert.ok(questLinkedEventCount > 0, "Expected at least one exactly anchored quest-triggered inspiration event.");
assert.ok(ruleLinkedEventCount > 0, "Expected high-confidence story-rule inspiration markers.");

console.log(`Inspiration events: ${ruleLinkedEventCount} story-rule and ${questLinkedEventCount} quest-triggered marker profile(s) use exact anchors.`);
