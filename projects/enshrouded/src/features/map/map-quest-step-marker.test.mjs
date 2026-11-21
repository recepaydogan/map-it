import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { findDirectedStepMarker } from "./map-quest-step-marker.ts";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const [steps, details, trainers, locale] = await Promise.all([
  readJson("../../../public/data/quests/step-locations.json"),
  readJson("../../../public/data/quests/quest-details.json"),
  readJson("../../../public/maps/world-atlas/locations-profession-trainers.json"),
  readJson("../../i18n/locales/en.json"),
]);
const points = trainers.locations.map((point) => ({
  ...point,
  name: locale.map.professionTrainers[point.id.split("-").at(-1)]?.name ?? point.name,
}));

function findQuestMarker(id, kind, index = 0) {
  const quest = steps.quests[id];
  const location = kind === "handIn" ? quest.handIn[index] : quest.objectives[index].locations[0];
  const label = kind === "handIn" ? location.name ?? "" : quest.objectives[index].name;
  return findDirectedStepMarker({ kind, location, label,
    questObjective: details.quests[id]?.objective,
    handInName: quest.handIn[0]?.name || details.quests[id]?.endsAt,
    handInLocations: quest.handIn }, points);
}

test("links an explicitly named objective to its nearby trainer", () => {
  assert.equal(findQuestMarker("96626", "objective")?.name, "Tomas");
});

test("links a generic delivery objective only when its hand-in names the same trainer", () => {
  assert.equal(findQuestMarker("97891", "objective")?.name, "Doctor Martin Felben");
});

test("links an unnamed hand-in when the quest directs the player to one nearby trainer", () => {
  assert.equal(findQuestMarker("97924", "handIn")?.name, "Helene Peltskinner");
});

test("does not replace an unrelated objective with a nearby NPC", () => {
  const sam = { id: "sam", name: "Sam Sarsaparilla", category: "npc", x: 0, y: 0 };
  assert.equal(findDirectedStepMarker({ kind: "objective", location: { x: 0, y: 0 },
    label: "Sit near the campfire × 1", questObjective: "Sit near Sam's Basic Campfire.",
    handInName: "Sam Sarsaparilla", handInLocations: [{ name: "Sam Sarsaparilla", x: 0, y: 0 }] }, [sam]), undefined);
});

test("requires a close, unambiguous NPC and an exact directed name", () => {
  const step = { kind: "objective", location: { x: 0, y: 0 }, label: "Learn cooking from Tomas × 1",
    handInLocations: [] };
  const tomas = { id: "tomas", name: "Tomas", category: "profession-trainer", x: 1, y: 0 };
  assert.equal(findDirectedStepMarker(step, [{ ...tomas, x: 21 }]), undefined);
  assert.equal(findDirectedStepMarker(step, [{ ...tomas, name: "Tomasina" }]), undefined);
  assert.equal(findDirectedStepMarker(step, [{ ...tomas, category: "quest" }]), undefined);
  assert.equal(findDirectedStepMarker({ ...step, label: "Speak with Tomas and talk to Adele Fielder" },
    [tomas, { ...tomas, id: "adele", name: "Adele Fielder" }]), undefined);
});
