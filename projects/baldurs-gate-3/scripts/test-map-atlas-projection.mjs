import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  getMapPointInstanceId,
  getPointSourceCoordinate,
  projectPointToAtlas,
  unprojectAtlasCoordinate,
} from "../src/features/map/map-atlas-projection.ts";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";

const atlas = {
  id: "test-atlas",
  name: "Test atlas",
  width: 1000,
  height: 800,
  featuredMapIds: ["upper"],
  placements: [
    { mapId: "upper", x: 100, y: 80, width: 400, height: 240 },
    { mapId: "lower", x: 550, y: 430, width: 300, height: 200 },
  ],
};
const boundsByMapId = new Map([
  ["upper", { minX: -200, minY: 100, maxX: 600, maxY: 580 }],
  ["lower", { minX: 0, minY: 0, maxX: 600, maxY: 400 }],
]);
const point = {
  id: "shared-id",
  mapId: "upper",
  category: "transition",
  name: "Passage",
  label: "Passage",
  subtype: "transition",
  x: 200,
  y: 340,
};

const projected = projectPointToAtlas(atlas, boundsByMapId, point);
assert.ok(projected);
assert.deepEqual(
  { x: projected.x, y: projected.y },
  { x: 300, y: 200 },
  "Local map coordinates should land at the matching atlas placement position.",
);
assert.deepEqual(projected.sourceCoordinate, { x: 200, y: 340 });
assert.equal(getMapPointInstanceId(projected), "upper:shared-id");
assert.deepEqual(getPointSourceCoordinate(projected), { x: 200, y: 340 });

const restored = unprojectAtlasCoordinate(atlas, boundsByMapId, projected);
assert.deepEqual(restored, {
  mapId: "upper",
  coordinate: { x: 200, y: 340 },
});
assert.equal(projectPointToAtlas(atlas, boundsByMapId, { ...point, mapId: "missing" }), null);
assert.equal(unprojectAtlasCoordinate(atlas, boundsByMapId, { x: 20, y: 20 }), null);
assert.notEqual(
  getMapPointInstanceId(projected),
  getMapPointInstanceId({ ...projected, mapId: "lower" }),
  "Identical marker ids on different maps must remain independently selectable.",
);

const registrySource = fs.readFileSync(path.resolve("src/features/map/map-registry.ts"), "utf8");
const atlasesDeclaration = registrySource.indexOf("export const MAP_ATLASES");
const atlasesStart = registrySource.indexOf("[", atlasesDeclaration);
const atlasesEnd = registrySource.indexOf("\n];", atlasesStart);
assert.ok(atlasesDeclaration >= 0 && atlasesStart >= 0 && atlasesEnd >= 0);
const registeredAtlases = Function(`"use strict"; return (${registrySource.slice(atlasesStart, atlasesEnd + 2)});`)();
const registeredMapIds = readRegisteredMapIds(registrySource);
assert.equal(registeredMapIds[0], "wilderness", "New maps must not change the default landing map.");
const placedMapIds = new Set();

for (const registeredAtlas of registeredAtlases) {
  for (let index = 0; index < registeredAtlas.placements.length; index += 1) {
    const placement = registeredAtlas.placements[index];
    assert.ok(!placedMapIds.has(placement.mapId), `${placement.mapId} is placed in more than one atlas.`);
    assert.ok(placement.x >= 0 && placement.y >= 0);
    assert.ok(placement.x + placement.width <= registeredAtlas.width);
    assert.ok(placement.y + placement.height <= registeredAtlas.height);
    placedMapIds.add(placement.mapId);
    for (const candidate of registeredAtlas.placements.slice(index + 1)) {
      const overlapWidth = Math.min(placement.x + placement.width, candidate.x + candidate.width)
        - Math.max(placement.x, candidate.x);
      const overlapHeight = Math.min(placement.y + placement.height, candidate.y + candidate.height)
        - Math.max(placement.y, candidate.y);
      assert.ok(overlapWidth <= 0 || overlapHeight <= 0,
        `${placement.mapId} overlaps ${candidate.mapId} in ${registeredAtlas.id}.`);
    }
  }
}
assert.deepEqual([...placedMapIds].sort(), [...registeredMapIds].sort(), "Every registered map must have one atlas placement.");

const baldursGateAtlas = registeredAtlases.find(({ id }) => id === "baldurs-gate");
assert.ok(baldursGateAtlas);
const baldursGatePlacements = new Map(baldursGateAtlas.placements.map((placement) => [placement.mapId, placement]));
const rectangleGap = (left, right) => Math.hypot(
  Math.max(left.x - (right.x + right.width), right.x - (left.x + left.width), 0),
  Math.max(left.y - (right.y + right.height), right.y - (left.y + left.height), 0),
);
for (const [leftId, rightId] of [
  ["szarr-palace", "cazador-dungeon"],
  ["house-of-hope", "house-of-hope-prison"],
  ["lower-city", "lower-city-sewers"],
  ["steel-watch-foundry", "flymms-cargo-basement"],
  ["flymms-cargo-basement", "submersible"],
  ["submersible", "iron-throne"],
  ["wyrms-crossing", "wyrms-rock-prison"],
  ["wyrms-rock-prison", "wyrmway"],
  ["wyrmway", "dragon-sanctum"],
]) {
  const left = baldursGatePlacements.get(leftId);
  const right = baldursGatePlacements.get(rightId);
  assert.ok(left && right, `Missing topology placement for ${leftId} or ${rightId}.`);
  assert.ok(rectangleGap(left, right) <= 400, `${leftId} and ${rightId} are too far apart in the atlas.`);
}

console.log("Map atlas projection tests passed.");
