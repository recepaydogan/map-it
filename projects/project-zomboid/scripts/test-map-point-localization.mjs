import assert from "node:assert/strict";
import { localizeMapObjectPoint } from "../src/features/map/map-point-localization.ts";

const translations = {
  "map.objectTypes.well": "井戸",
  "map.categories.object-water": "井戸",
};
const translate = (key, fallback) => translations[key] ?? fallback;
const well = {
  id: "well",
  name: "Well",
  category: "object-water",
  label: "Water sources",
  subtype: "object:well",
  townId: "rosewood",
  town: "ローズウッド",
  x: 8819,
  y: 11597,
};

assert.deepEqual(localizeMapObjectPoint(well, translate), {
  ...well,
  name: "井戸",
  label: "井戸",
});

const building = { ...well, subtype: "building", name: "Rosewood House" };
assert.equal(localizeMapObjectPoint(building, translate), building);

console.log("Map point localization checks passed.");
