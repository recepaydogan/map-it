import assert from "node:assert/strict";
import test from "node:test";
import { mergeMapMarkerSources } from "./gta6-marker-sources.mjs";

const bounds = { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 };
const source = (id, name, x, y, category = "landmark") => ({ id, name, category, x, y });
const primary = (id, name, x, y, areaLabel = false) => ({
  id: `leonida-${id.toLowerCase()}`, name, x, y: -y, category: "place-landmark", areaLabel,
  landmark: { id, nameStatus: areaLabel ? "unknown" : "confirmed", gameCoordinates: { x, y } },
  memberIds: [`leonida-${id.toLowerCase()}`], aliasIds: [],
});
const merge = (records, sources, reviewedMatches = {}) => mergeMapMarkerSources(
  { records, aliases: {} }, { records: sources }, reviewedMatches, bounds,
);

test("named GTABase-only locations remain internal comparison entries", () => {
  const marker = source("landmark-042", "Wildland Zoo", 25, 20);
  const region = primary("L628", "Vice-Dale County", 20, 20, true);
  const result = merge([region], [marker]);
  assert.equal(result.records.size, 1);
  assert.equal(result.records.get(region.id), region);
  assert.equal(result.comparisons[0].canonicalId, undefined);
  assert.deepEqual(result.attachments, []);
  assert.equal(result.comparisons[0].status, "secondary-only");
});

test("a later GTADB match keeps the primary coordinates and migrates the secondary pin ID", () => {
  const marker = source("police-station-008", "Hamlet Police Station", 30, 20, "police-station");
  const police = primary("L3252", "Hamlet Police Department", 24, 18);
  const result = merge([police], [marker]);
  assert.equal(result.records.size, 1);
  assert.deepEqual(result.records.get(police.id).landmark.gameCoordinates, { x: 24, y: 18 });
  assert.deepEqual(result.records.get(police.id).aliasIds, ["leonida-police-station-008"]);
  assert.equal(result.aliases["leonida-police-station-008"], police.id);
  assert.equal(result.comparisons[0].primarySourceId, "L3252");
});

test("ambiguous branches do not attach metadata without review", () => {
  const store = primary("L1", "Xero Gas Station", 30, 40);
  const left = source("gas-station-01", "Xero Gas Station", 10, 40, "gas-station");
  const right = source("gas-station-02", "Xero Gas Station", 50, 40, "gas-station");
  const ambiguous = merge([store], [left, right]);
  assert.equal(ambiguous.records.size, 1);
  assert.deepEqual(ambiguous.attachments, []);
  assert(ambiguous.comparisons.every(row => row.status === "secondary-only" && row.candidates[0].id === "L1"));
  const checked = merge([store], [left, right], { [left.id]: "L1" });
  assert.equal(checked.records.size, 1);
  assert.equal(checked.aliases[`leonida-${left.id}`], store.id);
  assert.equal(checked.aliases[`leonida-${right.id}`], undefined);
});

test("duplicate or unnamed secondary points cannot publish pins", () => {
  const result = merge([], [
    source("card-one-001", "Summer Card", 10, 15, "card-one"),
    source("card-two-001", "Summer Card", 10, 15, "card-two"),
    source("landmark-999", "?", 11, 18),
  ]);
  assert.equal(result.records.size, 0);
  assert.deepEqual(result.aliases, {});
  assert.equal(result.comparisons.at(-1).status, "invalid-or-unnamed");
});

test("reviewed listings in different categories share the GTADB venue", () => {
  const field = primary("L196", "Fleeca Field", 10, 15);
  const result = merge([field], [
    source("landmark-003", "Fleeca Field", 10, 15),
    source("waink-landmark-017", "Fleeca Field", 11, 22, "waink-landmark"),
  ], { "landmark-003": "L196", "waink-landmark-017": "L196" });
  assert.equal(result.records.size, 1);
  assert.deepEqual(result.aliases, { "leonida-landmark-003": field.id, "leonida-waink-landmark-017": field.id });
  assert.deepEqual(result.records.get(field.id).landmark.gameCoordinates, field.landmark.gameCoordinates);
});

test("a retired duplicate pin resolves through the surviving source match", () => {
  const vessel = source("waink-landmark-029", "Derelict Spy Vessel", 30, 20, "waink-landmark");
  const previousId = "leonida-waink-curiosity-036";
  const primaryVessel = primary("L1", "Derelict Spy Vessel", 32, 20);
  const result = merge([primaryVessel], [vessel]);
  assert.equal(result.records.size, 1);
  assert.equal(result.aliases[previousId], primaryVessel.id);
  assert(result.records.get(primaryVessel.id).aliasIds.includes(previousId));
});
