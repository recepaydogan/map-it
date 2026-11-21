import assert from "node:assert/strict";
import fs from "node:fs";
import { applyLevelTransform, createLevelTransformResolver } from "./lib/level-coordinate-transform.mjs";

const position = { x: 3, y: 8, z: 5 };
const rotations = [[13, 25], [5, 23], [7, 15], [15, 17]];
for (const [rotationQuarterTurns, [x, z]] of rotations.entries()) {
  assert.deepEqual(applyLevelTransform(position, { rotationQuarterTurns, offset: { x: 10, z: 20 } }), { x, y: 8, z });
}
assert.equal(applyLevelTransform(position, null), position);
const region = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
const base = { id: "a/parent", module: "a", level: "parent", offset: { x: 100, z: 200 }, regions: [region], matchCount: 1 };
const resolve = createLevelTransformResolver({
  transforms: [base, { ...base, id: "a/child", level: "child" }],
  templateTransforms: [{ parentModule: "a", parentLevel: "parent" }],
});
assert.equal(resolve("a", "parent", position), base);
assert.equal(resolve("a", "parent", { x: 50, y: 0, z: 50 }), null, "A parent transform cannot move unrelated world coordinates.");
assert.equal(resolve("other", "child", position)?.id, "a/child", "Unambiguous cross-module child identity is retained.");
const ambiguous = createLevelTransformResolver({ transforms: [base, { ...base, id: "b/parent", module: "b" }] });
assert.equal(ambiguous("other", "parent", position), null, "Ambiguous cross-module overlap is never guessed.");

const catalog = JSON.parse(fs.readFileSync("map-sources/catalog/level-transforms.json", "utf8"));
const resolveReal = createLevelTransformResolver(catalog);
const origin = { x: -0.75, y: -0.04927349, z: -98.75 };
const sourceTransform = resolveReal("GustavDev", "CTY_SorcerousSundriesBasement_A", origin);
const projected = applyLevelTransform(origin, sourceTransform);
assert.ok(Math.abs(projected.x - 359.25) < 0.001 && Math.abs(projected.z - 951.25) < 0.001);
assert.equal(projected.y, origin.y, "Horizontal map calibration does not invent a floor height.");
console.log("Shared level-coordinate transform tests passed.");
