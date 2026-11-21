import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filterPointsForFactions, getCharacterMapFactions, MAP_FACTIONS } from "./map-faction-filter.ts";

const root = new URL("../../../", import.meta.url);
const registry = readFileSync(new URL("src/features/map/map-registry.ts", root), "utf8");
const fileList = registry.match(/locationFiles: \[([^\]]+)\]/)?.[1];
assert.ok(fileList, "The registered world-atlas location files must be found");
const files = [...fileList.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
const locations = files.flatMap((file) => JSON.parse(readFileSync(
  new URL(`public/maps/world-atlas/${file}`, root), "utf8",
)).locations);
const linkedQuests = locations.filter((point) => point.questGiverMarkerId && point.questId);
const sourcePoints = locations.filter((point) => !point.questGiverMarkerId || !point.questId);
const linkedByGiverAndQuest = new Map(linkedQuests.map((point) =>
  [`${point.questGiverMarkerId}:${point.questId}`, point]));

test("character factions retain their own side and Neutral without opposite-side markers", () => {
  assert.deepEqual(getCharacterMapFactions("horde"), ["Horde", "Neutral"]);
  assert.deepEqual(getCharacterMapFactions("alliance"), ["Alliance", "Neutral"]);

  for (const side of ["horde", "alliance"]) {
    const allowed = getCharacterMapFactions(side);
    const visible = filterPointsForFactions(sourcePoints, allowed, locations);
    const quests = filterPointsForFactions(linkedQuests, allowed, locations);
    const trainers = visible.filter((point) => point.category === "class-trainer" || point.category === "profession-trainer");

    assert.ok(quests.some((point) => point.questInfo.faction === "Neutral"), `${side} should see Neutral quests`);
    assert.ok(quests.some((point) => point.questInfo.faction === allowed[0]), `${side} should see its own quests`);
    assert.ok(quests.every((point) => allowed.includes(point.questInfo.faction)), `${side} leaked an opposite-side quest`);
    assert.ok(trainers.every((point) => allowed.includes(point.trainerFaction)), `${side} leaked an opposite-side or unclassified trainer`);
    assert.ok(visible.some((point) => point.category === "flight-master"), `${side} lost generic map markers`);

    for (const giver of visible.filter((point) => point.questOffers?.length)) {
      for (const offer of giver.questOffers) {
        const quest = linkedByGiverAndQuest.get(`${giver.id}:${offer.id}`);
        assert.ok(quest?.questInfo?.faction, `Missing faction for ${giver.id}:${offer.id}`);
        assert.ok(allowed.includes(quest.questInfo.faction), `${side} leaked offer ${offer.id}`);
      }
    }
  }
});

test("a Neutral giver only offers quests available to the selected side", () => {
  const giverId = "forever-all-quest-giver-11863-1";
  const alliance = filterPointsForFactions(sourcePoints, getCharacterMapFactions("alliance"), locations)
    .find((point) => point.id === giverId);
  const horde = filterPointsForFactions(sourcePoints, getCharacterMapFactions("horde"), locations)
    .find((point) => point.id === giverId);

  assert.ok(alliance);
  assert.ok(horde);
  assert.deepEqual(alliance.questOffers.map((offer) => offer.id).sort(), ["5741", "6027", "93678"]);
  assert.deepEqual(horde.questOffers.map((offer) => offer.id).sort(), ["5741", "6027", "93465", "93678"]);
});

test("Default shows every source marker and character filters retain personal markers", () => {
  assert.equal(filterPointsForFactions(sourcePoints, MAP_FACTIONS, locations), sourcePoints);
  const personal = { id: "test-pin", category: "custom", subtype: "custom" };
  for (const side of ["horde", "alliance"]) {
    assert.ok(filterPointsForFactions([personal], getCharacterMapFactions(side)).includes(personal));
  }
});

test("deselecting every faction hides faction layers while retaining unrelated and personal markers", () => {
  assert.deepEqual(filterPointsForFactions(linkedQuests, [], locations), []);
  const visible = filterPointsForFactions(sourcePoints, [], locations);
  assert.ok(visible.length > 0);
  assert.ok(visible.every((point) => !point.questInfo?.faction && !point.trainerFaction));
  assert.ok(visible.every((point) => !point.questOffers?.length));
  assert.ok(visible.every((point) => point.category !== "class-trainer" && point.category !== "profession-trainer"));
  assert.ok(visible.some((point) => point.category === "flight-master"));
  const personal = { id: "test-pin", category: "custom", subtype: "custom" };
  assert.deepEqual(filterPointsForFactions([personal], []), [personal]);
});
