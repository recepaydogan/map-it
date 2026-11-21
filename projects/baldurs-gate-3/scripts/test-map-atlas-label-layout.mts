import assert from "node:assert/strict";
import { layoutAtlasLabels } from "../src/features/map/map-atlas-label-layout.ts";

const viewport = { width: 1_000, height: 600 };
const baseCandidate = {
  mapId: "large-map",
  width: 100,
  height: 30,
  selected: true,
  featured: true,
};

const place = (left: number, width: number) => layoutAtlasLabels([{
  ...baseCandidate,
  rectangle: { left, top: 100, width, height: 300 },
}], viewport)[0];

assert.equal(place(-200, 1_400)?.left, 450,
  "a label should be centred on its map");
assert.equal(place(-120.25, 1_400)?.left, 529.75,
  "a label should preserve the map's fractional horizontal movement without wobbling");
assert.equal(place(100, 400)?.left, 250,
  "a fully visible map should keep its label centred over the map");
assert.equal(place(900, 200)?.left, 950,
  "a partially visible map label should stay attached instead of sliding along the viewport edge");

console.log("Map atlas label layout tests passed.");
