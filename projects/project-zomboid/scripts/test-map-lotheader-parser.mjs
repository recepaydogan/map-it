import assert from "node:assert/strict";
import { parseLotHeader, parseLotHeaderNavigationConfig } from "./map-lotheader-parser.mjs";
import { parseLotPackObjectLocations } from "./map-lotpack-object-parser.mjs";

const chunks = [];
const uint32 = (value) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  chunks.push(buffer);
};
const int32 = (value) => {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32LE(value);
  chunks.push(buffer);
};
const line = (value) => chunks.push(Buffer.from(`${value}\n`, "utf8"));

chunks.push(Buffer.from("LOTH"));
uint32(1);
uint32(0);
uint32(256);
uint32(256);
int32(0);
int32(0);
uint32(2);
line("kitchen");
int32(0);
uint32(1);
int32(10); int32(20); int32(8); int32(6);
uint32(0);
line("bedroom");
int32(1);
uint32(1);
int32(18); int32(20); int32(6); int32(6);
uint32(0);
uint32(1);
uint32(2);
uint32(0);
uint32(1);

assert.deepEqual(parseLotHeader(Buffer.concat(chunks), 2, 3), [{
  id: "building-2-3-0",
  cellX: 2,
  cellY: 3,
  x: 529,
  y: 791,
  bounds: { minX: 522, minY: 788, maxX: 536, maxY: 794 },
  roomTypes: ["bedroom", "kitchen"],
  containers: [],
  floors: [0, 1],
  roomCount: 2,
}]);

const emptyBlock = Buffer.alloc(8);
emptyBlock.writeInt32LE(-1, 0);
emptyBlock.writeInt32LE(64, 4);
const populatedBlock = Buffer.alloc(28);
populatedBlock.writeInt32LE(-1, 0);
populatedBlock.writeInt32LE(20, 4);
populatedBlock.writeInt32LE(2, 8);
populatedBlock.writeInt32LE(1, 12);
populatedBlock.writeInt32LE(0, 16);
populatedBlock.writeInt32LE(-1, 20);
populatedBlock.writeInt32LE(43, 24);
const blockCount = 32 * 32;
const populatedBlockIndex = 34;
const lotPackBlocks = Array.from(
  { length: blockCount },
  (_, index) => index === populatedBlockIndex ? populatedBlock : emptyBlock,
);
const lotPackHeader = Buffer.alloc(12 + blockCount * 8);
lotPackHeader.write("LOTP", 0, "ascii");
lotPackHeader.writeUInt32LE(1, 4);
lotPackHeader.writeUInt32LE(blockCount, 8);
let blockOffset = lotPackHeader.length;
for (let index = 0; index < blockCount; index += 1) {
  lotPackHeader.writeUInt32LE(blockOffset, 12 + index * 8);
  blockOffset += lotPackBlocks[index].length;
}
const lotPack = Buffer.concat([
  lotPackHeader,
  ...lotPackBlocks,
]);

const headerWithTile = Buffer.concat([
  chunks[0],
  chunks[1],
  (() => { const value = Buffer.alloc(4); value.writeUInt32LE(1); return value; })(),
  Buffer.from("fixtures_counters_01_0\n", "utf8"),
  ...chunks.slice(3),
]);
const parsedWithContainers = parseLotHeader(headerWithTile, 2, 3, {
  lotPackBuffer: lotPack,
  tileContainerTypes: new Map([["fixtures_counters_01_0", "counter"]]),
});
assert.deepEqual(parsedWithContainers[0].containers, [{
  roomId: 0,
  room: "kitchen",
  container: "counter",
  tile: "fixtures_counters_01_0",
  x: 10,
  y: 20,
  floor: 0,
}]);

const objectLocations = parseLotPackObjectLocations({
  buffer: lotPack,
  headerConfig: parseLotHeaderNavigationConfig(headerWithTile),
  cellX: 2,
  cellY: 3,
  objectDefinitions: new Map([["fixtures_counters_01_0", {
    type: "workbench",
    category: "object-workbenches",
  }]]),
  objectLabels: {
    types: { workbench: "Workbench" },
    categories: { "object-workbenches": "Workbenches" },
  },
  towns: [{ id: "test-town", name: "Test Town", x: 522, y: 788 }],
  sourceId: "test",
});
assert.deepEqual(objectLocations, [{
  id: "test:object:2:3:0:10:20:workbench",
  name: "Workbench",
  category: "object-workbenches",
  label: "Workbenches",
  subtype: "object:workbench",
  townId: "test-town",
  town: "Test Town",
  x: 522,
  y: 788,
  floors: [0],
}]);

console.log("Lotheader building, room and useful object extraction tests passed.");
