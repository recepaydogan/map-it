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

const readLotPackBlock = ({
  buffer,
  offset,
  blockIndex,
  blockSize,
  blocksPerCell,
  minLayer,
  maxLayer,
  tileNames,
  onSquare,
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

        const rawRoomId = reader.readInt32();
        const squareX = blockX * blockSize + localX;
        const squareY = blockY * blockSize + localY;
        const placedTiles = Array.from({ length: count - 1 }, () => tileNames[reader.readInt32()]);
        onSquare({ rawRoomId, x: squareX, y: squareY, floor: layer, tileNames: placedTiles });
      }
    }
  }
};

export const parseLotPackTiles = ({
  buffer,
  version,
  blockSize,
  blocksPerCell,
  minLayer,
  maxLayer,
  tileNames,
  onSquare,
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

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const blockOffset = buffer.readUInt32LE(blockTableOffset + blockIndex * 8);
    readLotPackBlock({
      buffer,
      offset: blockOffset,
      blockIndex,
      blockSize,
      blocksPerCell,
      minLayer,
      maxLayer,
      tileNames,
      onSquare,
    });
  }
};

export const parseLotPackContainers = ({
  buffer,
  version,
  blockSize,
  blocksPerCell,
  minLayer,
  maxLayer,
  rooms,
  tileNames,
  tileContainerTypes,
  buildingIdByRoomId,
}) => {
  const containersByBuildingId = new Map();
  const containsSquare = (room, x, y, floor) => room
    && room.floor === floor
    && room.rects.some((rect) => (
      x >= rect.x
      && x < rect.x + rect.width
      && y >= rect.y
      && y < rect.y + rect.height
    ));
  const getRoomIdAt = (rawRoomId, x, y, floor) => {
    for (const roomId of [rawRoomId, rawRoomId - 1, rawRoomId + 1]) {
      if (containsSquare(rooms[roomId], x, y, floor)) return roomId;
    }
    return rooms.findIndex((room) => containsSquare(room, x, y, floor));
  };

  parseLotPackTiles({
    buffer,
    version,
    blockSize,
    blocksPerCell,
    minLayer,
    maxLayer,
    tileNames,
    onSquare: ({ rawRoomId, x, y, floor, tileNames: placedTiles }) => {
      const roomId = getRoomIdAt(rawRoomId, x, y, floor);
      const buildingId = buildingIdByRoomId.get(roomId);
      const room = rooms[roomId]?.name;
      if (!buildingId || !room) return;
      for (const tileName of placedTiles) {
        const container = tileContainerTypes.get(tileName);
        if (!container) continue;
        const placements = containersByBuildingId.get(buildingId) ?? [];
        placements.push({ roomId, room: room.toLowerCase(), container, tile: tileName, x, y, floor });
        containersByBuildingId.set(buildingId, placements);
      }
    },
  });

  return containersByBuildingId;
};
