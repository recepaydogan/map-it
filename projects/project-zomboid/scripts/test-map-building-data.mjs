import assert from "node:assert/strict";
import { buildMapBuildingLocations, parseWorldMapBuildingFeatures } from "./map-building-data.mjs";

const xml = `<world><cell x="1" y="2"><feature><geometry><coordinates>
  <point x="10" y="20"/><point x="20" y="30"/>
</coordinates></geometry><properties>
  <property name="building" value="Residential"/><property name="RoomTone" value="ApartmentBuilding"/>
</properties></feature></cell></world>`;
const features = parseWorldMapBuildingFeatures(xml);
assert.equal(features[0].x, 315);
assert.equal(features[0].y, 625);

const result = buildMapBuildingLocations({
  buildings: [{
    id: "building-1-2-0",
    x: 315,
    y: 625,
    bounds: { minX: 310, minY: 620, maxX: 320, maxY: 630 },
    roomTypes: ["kitchen", "bedroom"],
    containers: [],
    floors: [0, 1],
    roomCount: 3,
  }],
  worldMapXml: xml,
  towns: [{ id: "test", name: "Test", x: 315, y: 625 }],
  buildingLootProfileIds: new Map([["building-1-2-0", ["container:kitchen:counter:test_0"]]]),
});
assert.equal(result.matchedFeatures, 1);
assert.equal(result.locations[0].category, "apartments");
assert.deepEqual(result.locations[0].lootProfileIds, ["container:kitchen:counter:test_0"]);

console.log("Map building data tests passed.");
