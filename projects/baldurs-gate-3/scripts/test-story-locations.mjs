import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8"));
const catalog = readJson("map-sources/catalog/story-location-relations.json");

assert.equal(catalog.stats.characterAnchors, 330, "Unexpected exact character-anchor count.");
assert.equal(catalog.stats.anchoredCharacters, 242, "Unexpected anchored-character count.");
assert.equal(catalog.stats.dynamicItemOrigins, 3, "All three exact removable-head origins must be preserved.");
assert.equal(new Set(catalog.characterAnchors.map(({ id }) => id)).size, catalog.stats.characterAnchors,
  "Character anchors must be unique.");
assert.ok(catalog.characterAnchors.every(({ character, anchor, evidence }) => character.id && anchor.id
  && evidence.length > 0
  && evidence.every(({ sourcePath, sourceLine, statement }) => sourcePath && Number.isInteger(sourceLine) && statement)),
  "Every character anchor must retain exact source evidence.");

const wulbrenId = "2d70edbf-1a70-4047-8099-48f3e75d93bf";
const wulbrenHeadId = "2e02bb20-3619-44d2-b1be-cca9697dfc01";
const wulbrenAnchorId = "871e4d40-bf0b-4222-b1df-223172782023";
assert.ok(catalog.byCharacterId[wulbrenId]?.some(({ anchor }) => anchor.id === wulbrenAnchorId),
  "Wulbren must resolve to his exact Act 3 Ironhand Hideout anchor.");
assert.equal(catalog.byItemId[wulbrenHeadId]?.source.id, wulbrenId,
  "Wulbren's head must be modeled as originating from Wulbren.");

const mapData = (mapId) => ({
  locations: readJson(`public/maps/${mapId}/locations.json`).locations,
  entities: readJson(`public/maps/${mapId}/content.json`).entities,
});
const entity = (mapId, id) => mapData(mapId).entities.find((candidate) => candidate.id === id);
const location = (mapId, id) => mapData(mapId).locations.find((candidate) => candidate.id === id);

assert.equal(location("wyrms-crossing", wulbrenHeadId), undefined,
  "The authored Wulbren-head staging coordinate must not leak onto the Wyrm's Crossing map.");
assert.ok(location("ironhand-hideout", wulbrenHeadId),
  "Wulbren's head must be anchored to Wulbren's exact Ironhand Hideout location.");
assert.deepEqual(entity("ironhand-hideout", wulbrenHeadId)?.itemStoryImpact?.acquisition, {
  kind: "head-removal",
  sourceContentId: wulbrenId,
  sourceTitle: "Wulbren Bongle",
  dynamic: true,
  resolvedToSource: true,
  evidence: catalog.byItemId[wulbrenHeadId].evidence,
});

const karlachHead = entity("wilderness", "931f6df2-b546-422c-beff-fe91682bdf49");
assert.equal(karlachHead?.itemStoryImpact?.acquisition?.sourceTitle, "Karlach");
assert.equal(karlachHead?.itemStoryImpact?.acquisition?.dynamic, true);

// Scripted destinations: Orin is authored in the Act 2 colony but the story
// teleports her to the Temple of Bhaal duel, which lies inside the sewers map.
const orinId = "bf24e0ec-a3a6-4905-bd2d-45dc8edf8101";
const orinDuelAnchorId = "810e97df-6e10-4ff3-94d4-2a466a3ec7c7";
assert.ok(catalog.stats.scriptedDestinations >= 300, "Expected at least 300 exact scripted character destinations.");
assert.ok(catalog.scriptedDestinations.every(({ character, anchor, kind, evidence }) => character.type === "character"
  && anchor.type === "trigger" && ["teleport", "move", "appear", "camp"].includes(kind) && evidence.length > 0),
  "Every scripted destination must join a character to a trigger with story evidence.");
assert.ok(catalog.scriptedDestinationsByCharacterId[orinId]?.some(({ anchor }) => anchor.id === orinDuelAnchorId),
  "Orin must resolve to her exact Temple of Bhaal trigger.");
const orinTemple = entity("lower-city-sewers", `${orinId}:destination:${orinDuelAnchorId}`);
assert.equal(orinTemple?.kind, "boss", "Orin must be a boss marker inside the Temple of Bhaal.");
assert.equal(orinTemple.storyDestination.characterContentId, orinId);
assert.ok(orinTemple.storyDestination.evidence.some(({ statement }) => statement.startsWith("TeleportTo(")));
assert.ok(location("lower-city-sewers", orinTemple.id), "Orin's Temple of Bhaal marker must have a map location.");
assert.equal(entity("lower-city-sewers", orinId), undefined, "Orin's authored Act 2 placement must not leak into the sewers map.");
for (const mapId of ["lower-city-sewers", "wilderness", "shadow-cursed-lands"]) {
  const copies = mapData(mapId).entities.filter(({ storyDestination }) => storyDestination);
  assert.equal(new Set(copies.map(({ storyDestination }) => storyDestination.characterContentId)).size, copies.length,
    `${mapId} must expose at most one story-destination marker per character.`);
}

const nereHead = entity("grymforge", "ac566f0d-9a24-4b91-a703-af913494ef0b");
assert.equal(nereHead?.itemStoryImpact?.acquisition?.sourceTitle, "Nere");
assert.equal(nereHead?.itemStoryImpact?.acquisition?.resolvedToSource, true);

console.log("Story locations: 330 exact character anchors, 3 dynamic item origins, and staging-coordinate suppression verified.");
