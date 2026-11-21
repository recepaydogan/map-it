import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getCharacterQuestGivers, mergeTrackedQuestPoints, TRACKED_QUEST_MARKER_SCALE, indexCharacterQuestDestinations } from "./character-quest-navigation.ts";

const read = async name => JSON.parse(await readFile(new URL(`../../../public/maps/world-atlas/${name}`, import.meta.url), "utf8"));
const [givers, quests] = await Promise.all([read("locations-forever-all-quest-givers.json"), read("locations-forever-all-quests.json")]);
test("the captured level-2 quest routes to its actual published giver marker", () => {
  const index = indexCharacterQuestDestinations([...givers.locations, ...quests.locations]);
  const destination = index.get("456");
  assert.equal(destination.giverName, "Conservator Ilthalaine");
  assert(givers.locations.some(point => point.id === destination.giverMarkerId));
  assert(quests.locations.some(point => point.id === destination.questMarkerId && point.questId === "456"));
});
test("same-name quests and unknown IDs cannot borrow another quest's destination", () => {
  const index = indexCharacterQuestDestinations(quests.locations);
  assert.notEqual(index.get("456").questMarkerId, index.get("457").questMarkerId);
  assert.equal(index.get("999999999"), undefined);
});
test("giver-only offers remain navigable without a dedicated quest marker", () => {
  const giver = givers.locations.find(point => point.questOffers?.some(offer => offer.id === "456"));
  const destination = indexCharacterQuestDestinations([giver]).get("456");
  assert.equal(destination.questMarkerId, giver.id);
  assert.equal(destination.giverMarkerId, giver.id);
});

test("tracking bypasses hidden layers and deduplicates giver pins shared by active quests", () => {
  const points = [...givers.locations, ...quests.locations];
  const tracked = getCharacterQuestGivers(points, ["456", "457"]);
  const giver = tracked.find(point => point.name === "Conservator Ilthalaine");
  assert(giver);
  assert.equal(new Set(tracked.map(point => point.id)).size, tracked.length);
  assert(!tracked.some(point => point.questId === "456"));
  assert(mergeTrackedQuestPoints([], tracked).some(point => point.id === giver.id));
  assert.equal(mergeTrackedQuestPoints([giver], tracked).filter(point => point.id === giver.id).length, 1);
  assert.equal(TRACKED_QUEST_MARKER_SCALE, 1.35);
});

test("removing or changing a character's active quests removes tracking overrides", () => {
  assert.deepEqual(getCharacterQuestGivers(givers.locations, []), []);
  assert.deepEqual(getCharacterQuestGivers(givers.locations, ["999999999"]), []);
});
