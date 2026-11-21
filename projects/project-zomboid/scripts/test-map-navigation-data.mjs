import assert from "node:assert/strict";
import {
  NAVIGATION_EDGE_CLIMB,
  NAVIGATION_EDGE_BLOCKED,
  NAVIGATION_EDGE_DOOR,
  NAVIGATION_NORTH_SHIFT,
  NAVIGATION_SQUARE_BLOCKED,
  NAVIGATION_WEST_SHIFT,
  getNavigationEdge,
} from "./map-navigation-format.mjs";
import { parseLotPackNavigation } from "./map-lotpack-navigation-parser.mjs";
import { buildNavigationTileProperties } from "./map-navigation-tile-properties.mjs";

const source = `
// floor_0
tile
{
  solidfloor =
}
// furniture_0
tile
{
  solidtrans =
}
// fence_0
tile
{
  HoppableN =
  solidtrans =
}
// door_0
tile
{
  WallW =
  DoorWallW =
  solidtrans =
}
// corner_0
tile
{
  WallNW =
  solidtrans =
}
// bridge_0
tile
{
  water =
  solidfloor =
}`;
const navigationTiles = buildNavigationTileProperties([source]);
assert.equal(navigationTiles.get("furniture_0").blocked, true);
assert.equal(navigationTiles.get("fence_0").blocked, false);
assert.equal(navigationTiles.get("fence_0").north, NAVIGATION_EDGE_CLIMB);
assert.equal(navigationTiles.get("door_0").west, NAVIGATION_EDGE_DOOR);
assert.equal(navigationTiles.get("corner_0").north, NAVIGATION_EDGE_BLOCKED);
assert.equal(navigationTiles.get("corner_0").west, NAVIGATION_EDGE_BLOCKED);
assert.equal(navigationTiles.get("bridge_0").water, true);
assert.equal(navigationTiles.get("bridge_0").floor, true);

const integers = [
  2, 0, 0,
  2, 0, 1,
  2, 0, 2,
  2, 0, 3,
];
const blockOffset = 20;
const buffer = Buffer.alloc(blockOffset + integers.length * 4);
buffer.write("LOTP", 0, "ascii");
buffer.writeUInt32LE(1, 4);
buffer.writeUInt32LE(1, 8);
buffer.writeUInt32LE(blockOffset, 12);
buffer.writeUInt32LE(integers.length * 4, 16);
integers.forEach((value, index) => buffer.writeInt32LE(value, blockOffset + index * 4));

const result = parseLotPackNavigation({
  buffer,
  version: 1,
  blockSize: 2,
  blocksPerCell: 1,
  minLayer: 0,
  maxLayer: 1,
  tileNames: ["floor_0", "furniture_0", "fence_0", "door_0"],
  navigationTiles,
});

assert.equal(result[0], 0);
assert.ok((result[2] & NAVIGATION_SQUARE_BLOCKED) !== 0);
assert.equal(getNavigationEdge(result[1], NAVIGATION_NORTH_SHIFT), NAVIGATION_EDGE_CLIMB);
assert.equal(getNavigationEdge(result[3], NAVIGATION_WEST_SHIFT), NAVIGATION_EDGE_DOOR);

console.log("Map navigation tile and lotpack parsing tests passed.");
