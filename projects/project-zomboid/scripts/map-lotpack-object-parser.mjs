import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseLotHeaderNavigationConfig } from "./map-lotheader-parser.mjs";
import { parseLotPackTiles } from "./map-lotpack-container-parser.mjs";

const HEADER_PATTERN = /^(-?\d+)_(-?\d+)[.]lotheader$/;

const nearestTown = (towns, x, y) => towns.reduce((nearest, town) => {
  const distance = (town.x - x) ** 2 + (town.y - y) ** 2;
  return !nearest || distance < nearest.distance ? { town, distance } : nearest;
}, null)?.town;

export const parseLotPackObjectLocations = ({
  buffer,
  headerConfig,
  cellX,
  cellY,
  objectDefinitions,
  objectLabels,
  towns,
  sourceId,
}) => {
  if (towns.length === 0) throw new Error("Map object extraction requires at least one town.");
  const locations = [];
  const seen = new Set();
  parseLotPackTiles({
    buffer,
    ...headerConfig,
    onSquare: ({ x, y, floor, tileNames }) => {
      for (const tileName of tileNames) {
        const object = objectDefinitions.get(tileName);
        if (!object) continue;
        const worldX = cellX * headerConfig.cellSize + x;
        const worldY = cellY * headerConfig.cellSize + y;
        const id = `${sourceId}:object:${cellX}:${cellY}:${floor}:${x}:${y}:${object.type}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const town = nearestTown(towns, worldX, worldY);
        const name = objectLabels.types[object.type];
        const label = objectLabels.categories[object.category];
        if (!name || !label) throw new Error(`Missing map object label for ${object.type}/${object.category}.`);
        locations.push({
          id,
          name,
          category: object.category,
          label,
          subtype: `object:${object.type}`,
          townId: town.id,
          town: town.name,
          x: worldX,
          y: worldY,
          floors: [floor],
        });
      }
    },
  });
  return locations;
};

export const readMapObjectLocations = ({
  mapRoot,
  objectDefinitions,
  objectLabels,
  towns,
  sourceId,
}) => readdirSync(mapRoot).flatMap((filename) => {
  const match = filename.match(HEADER_PATTERN);
  if (!match) return [];
  const lotPackPath = join(mapRoot, `world_${match[1]}_${match[2]}.lotpack`);
  if (!existsSync(lotPackPath)) return [];
  const headerConfig = parseLotHeaderNavigationConfig(readFileSync(join(mapRoot, filename)));
  return parseLotPackObjectLocations({
    buffer: readFileSync(lotPackPath),
    headerConfig,
    cellX: Number(match[1]),
    cellY: Number(match[2]),
    objectDefinitions,
    objectLabels,
    towns,
    sourceId,
  });
});
