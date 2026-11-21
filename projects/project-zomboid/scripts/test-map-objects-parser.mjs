import assert from "node:assert/strict";
import { parseMapObjects } from "./map-objects-parser.mjs";

const result = parseMapObjects(`objects = {
  { name = "Forest", type = "Vegitation", x = 10, y = 20, z = 0, width = 30, height = 40 },
  { name = "Factory", type = "ZombiesType", z = 0, geometry = "polygon", points = { 1, 2, 5, 2, 5, 8, 1, 8 } },
}`);

assert.deepEqual(result, [
  { name: "Forest", type: "Vegitation", geometry: "rectangle", x: 10, y: 20, z: 0, width: 30, height: 40 },
  { name: "Factory", type: "ZombiesType", geometry: "polygon", z: 0, points: [1, 2, 5, 2, 5, 8, 1, 8] },
]);

console.log("Map objects parser tests passed.");
