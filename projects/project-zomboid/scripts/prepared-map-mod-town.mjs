const splitMapFolderWords = (value) => value
  .replace(/[_-]+/g, " ")
  .replace(/([a-z])([A-Z])/g, "$1 $2")
  .replace(/([A-Za-z])(\d+)/g, "$1 $2")
  .replace(/(\d+)([A-Za-z])/g, "$1 $2")
  .replace(/\bTraindepot\b/gi, "Train Depot")
  .replace(/\bWestpoint\b/gi, "West Point")
  .replace(/\s+/g, " ")
  .trim();

export const getPreparedMapTownName = (mapFolder, fallbackName) => {
  const secretZMatch = mapFolder.match(/^SZ(?:[_-]+|(?=[A-Z]))(.*)$/i);
  const areaName = splitMapFolderWords(secretZMatch?.[1] ?? mapFolder);
  if (!areaName) return fallbackName;
  return secretZMatch ? `SecretZ ${areaName}` : areaName;
};

const getBuildingFootprint = ({ bounds }) => (
  Math.max(1, bounds.maxX - bounds.minX + 1)
  * Math.max(1, bounds.maxY - bounds.minY + 1)
);

export const getPreparedMapTownAnchor = (buildings, cells, cellSize) => {
  const landmark = [...buildings].sort((left, right) =>
    getBuildingFootprint(right) - getBuildingFootprint(left)
    || right.roomCount - left.roomCount
    || left.id.localeCompare(right.id))[0];
  if (landmark) return { x: landmark.x, y: landmark.y, buildingId: landmark.id };

  const coordinates = cells.map((cell) => cell.split(",").map(Number));
  return {
    x: coordinates.reduce((sum, [x]) => sum + x * cellSize + cellSize / 2, 0) / coordinates.length,
    y: coordinates.reduce((sum, [, y]) => sum + y * cellSize + cellSize / 2, 0) / coordinates.length,
    buildingId: null,
  };
};
