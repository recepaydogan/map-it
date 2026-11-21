import assert from "node:assert/strict";
import { classifyMapBuilding, classifyMapLocation, humanizeMapSubtype } from "./map-location-classifier.mjs";

assert.deepEqual(classifyMapLocation("Hospital"), {
  category: "medical",
  label: "Hospital",
});
assert.deepEqual(classifyMapLocation("BarWood"), {
  category: "food",
  label: "Wooden Bar",
});
assert.deepEqual(classifyMapLocation("GasBurnt"), {
  category: "fuel",
  label: "Gas Burnt",
});
assert.deepEqual(classifyMapLocation("Warehousestorage"), {
  category: "industrial",
  label: "Warehouse Storage",
});
assert.equal(classifyMapLocation("Barn"), undefined);
assert.equal(classifyMapLocation("Residential"), undefined);
assert.equal(classifyMapLocation("RestaurantsAndEntertainment"), undefined);
assert.deepEqual(classifyMapBuilding("HouseSuburb"), {
  category: "houses",
  label: "House Suburb",
});
assert.deepEqual(classifyMapBuilding("ApartmentBuilding"), {
  category: "apartments",
  label: "Apartment Building",
});
assert.deepEqual(classifyMapBuilding("MilitaryApartments"), {
  category: "apartments",
  label: "Military Apartments",
});
assert.deepEqual(classifyMapBuilding("Barn"), {
  category: "agriculture",
  label: "Barn",
});
assert.equal(classifyMapBuilding("", ["bedroom", "kitchen"]).category, "residential");
assert.equal(humanizeMapSubtype("MilitaryCommunications"), "Military Communications");

console.log("Map location classifier tests passed.");
