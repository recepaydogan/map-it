import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveMapFocusPoint } from "./map-focus-request.ts";
import { filterPointsForFactions } from "./map-faction-filter.ts";

const giver = { id: "giver", name: "Cook Torka", category: "npc", x: 20, y: 30,
  questInfo: { faction: "Horde" }, questOffers: [{ id: "815", name: "Break a Few Eggs" }] };
const offer = { id: "offer", name: "Break a Few Eggs", category: "quest", x: 20, y: 30,
  aliasIds: ["old-offer"], questGiverMarkerId: "giver", questId: "815", questInfo: { faction: "Horde" } };
const map = { id: "azeroth", displayName: "Azeroth", locations: [giver, offer],
  regions: [{ id: "durotar", name: "Durotar", x: 40, y: 50 }],
  bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 } };

test("legacy quest IDs and their aliases focus the giver marker", () => {
  for (const pointId of ["giver", "offer", "old-offer"]) {
    assert.equal(resolveMapFocusPoint({ pointId, mapId: "azeroth" }, map, [giver]), giver);
  }
  assert.equal(resolveMapFocusPoint({ pointId: "offer" }, map, [offer, giver]), giver);
  assert.equal(resolveMapFocusPoint({ pointId: "offer" }, map, []), undefined);
  assert.equal(resolveMapFocusPoint({ pointId: "offer", mapId: "other-map" }, map, [giver]), undefined);
});

test("filtered source markers remain valid direct targets without widening the visible list", () => {
  const points = [giver];
  const visible = filterPointsForFactions(points, ["Alliance", "Neutral"], map.locations);
  assert.deepEqual(visible, []);
  for (const pointId of ["giver", "offer"]) {
    assert.equal(resolveMapFocusPoint({ pointId }, map, visible), undefined);
    assert.equal(resolveMapFocusPoint({ pointId }, map, points), giver);
  }
  assert.deepEqual(visible, []);
});

test("a removed reward marker can find the current giver by quest ID when the destination is unambiguous", () => {
  const pointId = "forever-all-quest-815-retired-giver";
  assert.equal(resolveMapFocusPoint({ pointId }, map, [giver]), giver);

  const second = { ...giver, id: "second-giver" };
  const multipleGivers = { ...map, locations: [...map.locations, second] };
  assert.equal(resolveMapFocusPoint({ pointId }, multipleGivers, [giver, second]), undefined);
  assert.equal(resolveMapFocusPoint({ pointId }, multipleGivers, [giver]), undefined);
});

test("region links, coordinates and unknown markers keep their existing behavior", () => {
  assert.equal(resolveMapFocusPoint({ pointId: "region:durotar" }, map, [])?.subtype, "region");
  assert.equal(resolveMapFocusPoint({ destination: { name: "Arrival", x: 10, y: 10 } }, map, [])?.subtype, "coordinate");
  assert.equal(resolveMapFocusPoint({ destination: { name: "Outside", x: -1, y: 10 } }, map, []), undefined);
  assert.equal(resolveMapFocusPoint({ pointId: "missing" }, map, [giver]), undefined);
});
