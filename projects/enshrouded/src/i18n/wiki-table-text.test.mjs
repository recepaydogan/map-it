import assert from "node:assert/strict";
import test from "node:test";
import { plainWikiTables } from "./wiki-table-text.ts";

test("catalog table text retains locations, unknown cells and resource quantities", () => {
  const source = 'Directions. {| class="wikitable" ! Location !! Amount !! Hazards |- | [[Cave|Old Cave]] || 4 || ? |- | || 3 || Fell Critter |}';
  assert.equal(plainWikiTables(source), "Directions. Location: [[Cave|Old Cave]]; Amount: 4; Hazards: ?. Location: —; Amount: 3; Hazards: Fell Critter.");
});

test("recipe tables retain every requirement, count, time and original link target", () => {
  const source = '{| class="wikitable sortable" |+ Recipes |-! Product!! Station!! Time!! Ingredients |- | 5 [[Oil|Crafted Oil]] || Laboratory || 2:00 || * 5 Spores * 1 {{Item|Sulfur}} |}';
  assert.equal(plainWikiTables(source), "Recipes. Product: 5 [[Oil|Crafted Oil]]; Station: Laboratory; Time: 2:00; Ingredients: 5 Spores, 1 {{Item|Sulfur}}.");
});
