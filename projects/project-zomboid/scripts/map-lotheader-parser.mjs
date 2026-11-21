import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseLotPackContainers } from "./map-lotpack-container-parser.mjs";

const HEADER_PATTERN = /^(-?\d+)_(-?\d+)[.]lotheader$/;
const VERSION_CONFIG = {
  0: { cellSize: 300, blocksPerCell: 30, blockSize: 10, minLayer: 0, maxLayer: 8 },
  1: { cellSize: 256, blocksPerCell: 32, blockSize: 8, minLayer: -32, maxLayer: 32 },
};

class BinaryReader {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
  }

  readUInt32() {
    const value = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  readInt32() {
    const value = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  readLine() {
    const end = this.buffer.indexOf(10, this.offset);
    if (end < 0) throw new Error("Invalid lotheader string terminator.");
    const value = this.buffer.toString("utf8", this.offset, end);
    this.offset = end + 1;
    return value;
  }

  skip(bytes) {
    this.offset += bytes;
  }
}

const readRooms = (reader) => Array.from({ length: reader.readUInt32() }, (_, id) => {
  const name = reader.readLine();
  const floor = reader.readInt32();
  const rects = Array.from({ length: reader.readUInt32() }, () => ({
    x: reader.readInt32(),
    y: reader.readInt32(),
    width: reader.readInt32(),
    height: reader.readInt32(),
  }));
  const objectCount = reader.readUInt32();
  reader.skip(objectCount * 12);
  return { id, name, floor, rects };
});

const readBuildings = (reader) => Array.from({ length: reader.readUInt32() }, (_, id) => ({
  id,
  roomIds: Array.from({ length: reader.readUInt32() }, () => reader.readUInt32()),
}));

const getBounds = (rooms) => rooms
  .flatMap(({ rects }) => rects)
  .reduce((bounds, rect) => ({
    minX: Math.min(bounds.minX, rect.x),
    minY: Math.min(bounds.minY, rect.y),
    maxX: Math.max(bounds.maxX, rect.x + rect.width),
    maxY: Math.max(bounds.maxY, rect.y + rect.height),
  }), {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  });

const readLotHeaderPrefix = (buffer) => {
  const reader = new BinaryReader(buffer);
  const hasMagic = buffer.subarray(0, 4).toString("ascii") === "LOTH";
  if (hasMagic) reader.skip(4);
  const version = reader.readUInt32();
  const config = VERSION_CONFIG[version];
  if (!config) throw new Error(`Unsupported lotheader version ${version}.`);

  const tileCount = reader.readUInt32();
  const tileNames = Array.from({ length: tileCount }, () => reader.readLine());
  if (version === 0) reader.skip(1);
  reader.readUInt32();
  reader.readUInt32();
  let minLayer;
  let maxLayer;
  if (version === 0) {
    minLayer = 0;
    maxLayer = reader.readInt32();
  } else {
    minLayer = reader.readInt32();
    maxLayer = reader.readInt32() + 1;
  }
  minLayer = Math.max(minLayer, config.minLayer);
  maxLayer = Math.min(maxLayer, config.maxLayer);

  return { reader, version, config, tileNames, minLayer, maxLayer };
};

export const parseLotHeaderNavigationConfig = (buffer) => {
  const { version, config, tileNames, minLayer, maxLayer } = readLotHeaderPrefix(buffer);
  return {
    version,
    cellSize: config.cellSize,
    blockSize: config.blockSize,
    blocksPerCell: config.blocksPerCell,
    tileNames,
    minLayer,
    maxLayer,
  };
};

export const parseLotHeader = (buffer, cellX, cellY, options = {}) => {
  const { reader, version, config, tileNames, minLayer, maxLayer } = readLotHeaderPrefix(buffer);

  const rooms = readRooms(reader);
  const buildings = readBuildings(reader);
  const buildingIdByRoomId = new Map();
  for (const building of buildings) {
    const buildingId = `building-${cellX}-${cellY}-${building.id}`;
    for (const roomId of building.roomIds) buildingIdByRoomId.set(roomId, buildingId);
  }
  const containersByBuildingId = options.lotPackBuffer && options.tileContainerTypes
    ? parseLotPackContainers({
      buffer: options.lotPackBuffer,
      version,
      blockSize: config.blockSize,
      blocksPerCell: config.blocksPerCell,
      minLayer,
      maxLayer,
      rooms,
      tileNames,
      tileContainerTypes: options.tileContainerTypes,
      buildingIdByRoomId,
    })
    : new Map();

  return buildings.flatMap((building) => {
    const buildingRooms = building.roomIds.flatMap((roomId) => rooms[roomId] ? [rooms[roomId]] : []);
    if (buildingRooms.length === 0) return [];
    const localBounds = getBounds(buildingRooms);
    if (!Number.isFinite(localBounds.minX)) return [];
    const offsetX = cellX * config.cellSize;
    const offsetY = cellY * config.cellSize;
    return [{
      id: `building-${cellX}-${cellY}-${building.id}`,
      cellX,
      cellY,
      x: Math.round(offsetX + (localBounds.minX + localBounds.maxX) / 2),
      y: Math.round(offsetY + (localBounds.minY + localBounds.maxY) / 2),
      bounds: {
        minX: offsetX + localBounds.minX,
        minY: offsetY + localBounds.minY,
        maxX: offsetX + localBounds.maxX,
        maxY: offsetY + localBounds.maxY,
      },
      roomTypes: [...new Set(buildingRooms.map(({ name }) => name))].sort(),
      containers: containersByBuildingId.get(`building-${cellX}-${cellY}-${building.id}`) ?? [],
      floors: [...new Set(buildingRooms.map(({ floor }) => floor))].sort((left, right) => left - right),
      roomCount: buildingRooms.length,
    }];
  });
};

export const readMapBuildings = (mapRoot, tileContainerTypes) => readdirSync(mapRoot)
  .flatMap((filename) => {
    const match = filename.match(HEADER_PATTERN);
    if (!match) return [];
    const lotPackPath = join(mapRoot, `world_${match[1]}_${match[2]}.lotpack`);
    return parseLotHeader(
      readFileSync(join(mapRoot, filename)),
      Number(match[1]),
      Number(match[2]),
      tileContainerTypes && existsSync(lotPackPath)
        ? { lotPackBuffer: readFileSync(lotPackPath), tileContainerTypes }
        : undefined,
    );
  })
  .sort((left, right) => left.y - right.y || left.x - right.x || left.id.localeCompare(right.id));
