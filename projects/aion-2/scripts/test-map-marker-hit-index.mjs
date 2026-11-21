import assert from "node:assert/strict";
import { createMapMarkerHitIndex } from "../src/features/map/map-marker-hit-index.ts";
import { markerAlphaAt, markerAlphaPath } from "../src/features/map/map-marker-alpha.ts";

const make = (id, left, top) => ({ point: { id }, left, top });
const points = [make("negative", -32, -32), make("first", 16, 16), make("top", 32, 16)];
const pick = createMapMarkerHitIndex(points);
assert.equal(pick(-32, -32)?.point.id, "negative");
assert.equal(pick(16, 16)?.point.id, "top", "overlap selects the last painted marker");
assert.equal(pick(0, 16)?.point.id, "first", "marker bounds include cell boundaries");
assert.equal(pick(100, 100), null);
assert.equal(createMapMarkerHitIndex([])(0, 0), null);

const silhouette = { width: 3, height: 3, alpha: Uint8Array.from([
  0, 255, 0,
  255, 255, 255,
  0, 255, 0,
]) };
assert.equal(markerAlphaAt(silhouette, 0, 0), false, "transparent corners are not targets");
assert.equal(markerAlphaAt(silhouette, 1, 0), true, "visible artwork is a target");
assert.equal(markerAlphaPath(silhouette).includes("M1 0h1v1h-1z"), true);
const layered = createMapMarkerHitIndex([make("lower", 0, 0), make("upper", 0, 0)]);
assert.equal(layered(0, 0, ({ point }) => point.id === "lower")?.point.id, "lower",
  "transparent upper artwork lets the lower marker win");
assert.equal(createMapMarkerHitIndex([make("large", 80, 80)], () => 60)(25, 80)?.point.id, "large",
  "large artwork is found across more than one spatial cell");

let seed = 47;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const crowded = Array.from({ length: 20_000 }, (_, id) => make(id, random() * 2000 - 1000, random() * 1400 - 700));
const indexedPick = createMapMarkerHitIndex(crowded);
for (let test = 0; test < 1000; test += 1) {
  const x = random() * 2400 - 1200;
  const y = random() * 1800 - 900;
  const expected = crowded.findLast(({ left, top }) => Math.abs(left - x) <= 16 && Math.abs(top - y) <= 16) ?? null;
  assert.equal(indexedPick(x, y), expected, "picking agrees with reverse paint order");
}
assert.equal(createMapMarkerHitIndex(crowded.filter(({ point }) => point.id < 10))(9000, 9000), null);
console.log("Canvas marker picking passed: 20,000 markers, overlaps, cell boundaries, and empty space.");
