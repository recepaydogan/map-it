import assert from "node:assert/strict";
import { buildMapObjectTileDefinitions } from "./map-object-definitions.mjs";
import { parseTileContainerTypes, parseTileDefinitions } from "./map-tile-definitions-parser.mjs";

const result = parseTileContainerTypes([`tileset
{
  // fixtures_counters_01_0
  tile
  {
    container = counter
    solid =
  }
  // fixtures_counters_01_1
  tile
  {
    solid =
  }
}`]);

assert.equal(result.get("fixtures_counters_01_0"), "counter");
assert.equal(result.has("fixtures_counters_01_1"), false);

const patched = parseTileDefinitions([
  `// fixtures_counters_01_0\ntile\n{\n  solid =\n}`,
  `// fixtures_counters_01_0\ntile\n{\n  container = counter\n}`,
]);
assert.deepEqual(patched.get("fixtures_counters_01_0"), { solid: "", container: "counter" });

const objectTiles = buildMapObjectTileDefinitions(new Map([
  ["camping_01_16", {}],
  ["location_shop_fossoil_01_12", { fuelAmount: "20000" }],
  ["location_shop_fossoil_01_13", { fuelAmount: "20000" }],
  ["modded_generator", { CustomName: "Generator" }],
  ["modded_freezer_piece", { CustomName: "Freezer", SpriteGridPos: "1,0" }],
  ["ordinary_fridge", { CustomName: "Fridge" }],
]));
assert.deepEqual(objectTiles.get("camping_01_16"), { type: "well", category: "object-water" });
assert.deepEqual(objectTiles.get("location_shop_fossoil_01_12"), { type: "gas-pump", category: "object-fuel" });
assert.deepEqual(objectTiles.get("location_shop_fossoil_01_13"), { type: "gas-pump", category: "object-fuel" });
assert.deepEqual(objectTiles.get("modded_generator"), { type: "generator", category: "object-power" });
assert.equal(objectTiles.has("modded_freezer_piece"), false);
assert.equal(objectTiles.has("ordinary_fridge"), false);

console.log("Map tile definition and useful object classifier tests passed.");
