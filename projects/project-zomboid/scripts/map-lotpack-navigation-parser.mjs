import {
  NAVIGATION_EDGE_OPEN,
  NAVIGATION_EDGE_BLOCKED,
  NAVIGATION_NORTH_SHIFT,
  NAVIGATION_SQUARE_BLOCKED,
  NAVIGATION_SQUARE_SLOW,
  NAVIGATION_WEST_SHIFT,
  setNavigationEdge,
} from "./map-navigation-format.mjs";

class BinaryReader {
  constructor(buffer, offset = 0) {
    this.buffer = buffer;
    this.offset = offset;
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
}

const mergeEdge = (current, candidate) => {
  if (candidate === NAVIGATION_EDGE_OPEN) return current;
  if (current === NAVIGATION_EDGE_OPEN) return candidate;
  // A real door/window/fence sprite commonly shares its square with a wall
  // sprite. Preserve the explicit traversable edge over the generic wall.
  if (current === NAVIGATION_EDGE_BLOCKED) return candidate;
  if (candidate === NAVIGATION_EDGE_BLOCKED) return current;
  return Math.max(current, candidate);
};

const readNavigationBlock = ({
  buffer,
  offset,
  blockIndex,
  blockSize,
  blocksPerCell,
  minLayer,
  maxLayer,
  tileNames,
  navigationTiles,
  result,
}) => {
  const reader = new BinaryReader(buffer, offset);
  const blockX = Math.floor(blockIndex / blocksPerCell);
  const blockY = blockIndex % blocksPerCell;
  let skip = 0;

  for (let layer = minLayer; layer < maxLayer; layer += 1) {
    for (let localX = 0; localX < blockSize; localX += 1) {
      for (let localY = 0; localY < blockSize; localY += 1) {
        if (skip > 0) {
          skip -= 1;
          continue;
        }
        const count = reader.readInt32();
        if (count === -1) {
          skip = reader.readInt32();
          if (skip > 0) skip -= 1;
          continue;
        }
        if (count <= 1) continue;

        reader.readInt32(); // Room id; navigation is derived from tile geometry.
        let north = NAVIGATION_EDGE_OPEN;
        let west = NAVIGATION_EDGE_OPEN;
        let blocked = false;
        let slow = false;
        let water = false;
        let floor = false;
        for (let tileIndex = 0; tileIndex < count - 1; tileIndex += 1) {
          const tileName = tileNames[reader.readInt32()];
          const tile = navigationTiles.get(tileName);
          if (!tile || layer !== 0) continue;
          north = mergeEdge(north, tile.north);
          west = mergeEdge(west, tile.west);
          blocked ||= tile.blocked;
          slow ||= tile.slow;
          water ||= tile.water;
          floor ||= tile.floor;
        }
        if (layer !== 0) continue;

        const squareX = blockX * blockSize + localX;
        const squareY = blockY * blockSize + localY;
        const index = squareY * blocksPerCell * blockSize + squareX;
        let value = 0;
        value = setNavigationEdge(value, NAVIGATION_NORTH_SHIFT, north);
        value = setNavigationEdge(value, NAVIGATION_WEST_SHIFT, west);
        if (blocked || (water && !floor)) value |= NAVIGATION_SQUARE_BLOCKED;
        if (slow) value |= NAVIGATION_SQUARE_SLOW;
        result[index] = value;
      }
    }
  }
};

export const parseLotPackNavigation = ({
  buffer,
  version,
  blockSize,
  blocksPerCell,
  minLayer,
  maxLayer,
  tileNames,
  navigationTiles,
}) => {
  const reader = new BinaryReader(buffer);
  const hasMagic = buffer.subarray(0, 4).toString("ascii") === "LOTP";
  if (hasMagic) {
    reader.offset += 4;
    const packVersion = reader.readUInt32();
    if (packVersion !== version) {
      throw new Error(`Lotpack version ${packVersion} does not match lotheader version ${version}.`);
    }
  } else if (version !== 0) {
    throw new Error("A Build 42 lotpack is missing its LOTP header.");
  }

  const blockCount = reader.readUInt32();
  const blockTableOffset = reader.offset;
  const expectedBlockCount = blocksPerCell * blocksPerCell;
  if (blockCount !== expectedBlockCount) {
    throw new Error(`Unexpected lotpack block count ${blockCount}; expected ${expectedBlockCount}.`);
  }

  const result = new Uint8Array(expectedBlockCount * blockSize * blockSize);
  result.fill(NAVIGATION_SQUARE_BLOCKED);
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const blockOffset = buffer.readUInt32LE(blockTableOffset + blockIndex * 8);
    readNavigationBlock({
      buffer,
      offset: blockOffset,
      blockIndex,
      blockSize,
      blocksPerCell,
      minLayer,
      maxLayer,
      tileNames,
      navigationTiles,
      result,
    });
  }
  return result;
};
