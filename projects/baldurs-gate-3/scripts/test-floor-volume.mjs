import assert from "node:assert/strict";
import { buildFloorVolume, containsFloorPosition, selectFloorVolume, createFloorSelector, floorRasterAlignment } from "./lib/floor-volume.mjs";

const attr = (value) => ({ value });
const object = { BuildingUUID: attr("example"), Floor: attr(0), Height: attr(4),
  Transform: [{ Position: attr("10 20 30"), RotationQuat: attr("0 0 0 1"), Scale: attr(1) }],
  Points: [[0, 0], [8, 0], [8, 8], [4, 8], [4, 4], [0, 4]].map((point) => ({ Object: attr(point.join(" ")) })) };
const instance = { position: { x: 100, y: -10, z: 200 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: 1 };
const record = { id: "floor", level: "scene", position: { x: 110, y: 10, z: 230 }, templateProjection: { chain: [instance] } };
const volume = buildFloorVolume(object, record);
assert.equal(volume.minHeight, 10, "Authored parent height offsets must not be dropped");
assert.equal(volume.maxHeight, 14);
assert.ok(containsFloorPosition(volume, { x: 112, y: 11, z: 232 }));
assert.ok(!containsFloorPosition(volume, { x: 112, y: 15, z: 232 }), "Same X/Z on another floor cannot match");
assert.ok(!containsFloorPosition(volume, { x: 112, y: 14, z: 232 }), "Shared top boundary belongs to the next floor");
assert.ok(!containsFloorPosition(volume, { x: 112, y: 11, z: 237 }), "A bounding box cannot replace a concave native polygon");
assert.ok(containsFloorPosition(volume, { x: 110, y: 11, z: 231 }), "Authored polygon edges remain accessible");
assert.throws(() => buildFloorVolume(object, { ...record, position: { ...record.position, y: 20 } }), /disagree/);
assert.throws(() => buildFloorVolume({ ...object, Points: [] }, record), /polygon/);
const nextFloor = { ...volume, id: "next-floor", minHeight: 13.998, maxHeight: 18 };
assert.equal(selectFloorVolume([volume, nextFloor], { x: 112, y: 13.999, z: 232 }).id, "next-floor");
assert.equal(selectFloorVolume([nextFloor, volume], { x: 112, y: 11, z: 232 }).id, "floor");
assert.equal(selectFloorVolume([volume, nextFloor], { x: 112, y: 19, z: 232 }), null);
assert.equal(containsFloorPosition(volume, { x: 112, z: 232 }), false, "Unknown height cannot silently match a floor");
assert.equal(containsFloorPosition(volume, { x: 112, y: NaN, z: 232 }), false);
const catalog = { entries: [volume, nextFloor].map((entry) => ({ mapId: "parent", status: "resolved-native-volume", volume: entry })) };
const selected = createFloorSelector({ mapId: "parent", patchIds: [volume.id] }, catalog);
assert.equal(selected({ x: 112, y: 11, z: 232 }), true);
assert.equal(selected({ x: 112, y: 13.999, z: 232 }), false, "Sibling volumes must resolve the same overlap in generation and audits");
assert.throws(() => createFloorSelector({ mapId: "other-scene", patchIds: [volume.id] }, catalog), /missing/);
assert.throws(() => createFloorSelector({ mapId: "parent", patchIds: [volume.id, volume.id] }, catalog), /Duplicate/);
assert.throws(() => createFloorSelector({ mapId: "parent", patchIds: [volume.id] }, { entries: [{ ...catalog.entries[0], status: "requires-floor-identity-review" }] }), /review/);
const patch = { worldBounds: { centerX: 114, centerY: 234, width: 8, height: 8 }, sourceRaster: { width: 160, height: 160 } };
assert.equal(floorRasterAlignment(volume, patch).maxEdgeErrorPixels, 0);
assert.equal(floorRasterAlignment({ ...volume, polygon: volume.polygon.map((point) => ({ ...point, x: point.x + 1 })) }, patch).maxEdgeErrorPixels, 20,
  "A matching name on a shifted floor cannot establish raster identity");
console.log("Native floor volumes passed: parent height, polygon containment, shared edges and separate stacked floors.");

const box = { ...object, Points: undefined, Height: undefined, Extents: attr("2 3 4") };
const boxVolume = buildFloorVolume(box, record);
assert.equal(boxVolume.geometryType, "box");
assert.equal(boxVolume.minHeight, 7, "Box height extends below its transformed center");
assert.equal(boxVolume.maxHeight, 13);
assert.ok(containsFloorPosition(boxVolume, { x: 108, y: 7, z: 226 }));
assert.ok(!containsFloorPosition(boxVolume, { x: 110, y: 13, z: 230 }));
assert.ok(!containsFloorPosition(boxVolume, { x: 113, y: 10, z: 230 }));
const yaw = { ...box, Transform: [{ ...box.Transform[0], RotationQuat: attr(`0 ${Math.SQRT1_2} 0 ${Math.SQRT1_2}`) }] };
const rotatedBox = buildFloorVolume(yaw, record);
assert.ok(containsFloorPosition(rotatedBox, { x: 113, y: 10, z: 230 }));
assert.ok(!containsFloorPosition(rotatedBox, { x: 110, y: 10, z: 233 }));
assert.ok(floorRasterAlignment(rotatedBox, { worldBounds: { centerX: 110, centerY: 230, width: 8, height: 4 },
  sourceRaster: { width: 160, height: 80 } }).maxEdgeErrorPixels < 1e-8);
assert.throws(() => buildFloorVolume({ ...box, Extents: attr("2 -3 4") }, record), /extents/);
assert.throws(() => buildFloorVolume({ ...box, Extents: attr("2 3") }, record), /vector/);
assert.throws(() => buildFloorVolume({ ...box, Transform: [{ ...box.Transform[0],
  RotationQuat: attr(`${Math.SQRT1_2} 0 0 ${Math.SQRT1_2}`) }] }, record), /Tilted/);
console.log("Centered box floor volumes passed: half-extents, vertical bounds, rotated geometry and invalid-source rejection.");
