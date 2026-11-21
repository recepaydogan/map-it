import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const getTileRanges = (tileRoot, format) => {
  const coordinates = readdirSync(tileRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({ entry, match: new RegExp(`^(\\d+)_(\\d+)[.]${format}$`, "i").exec(entry.name) }))
    .filter(({ match }) => match)
    .map(({ match }) => ({ column: Number(match[1]), row: Number(match[2]) }))
    .sort((left, right) => left.row - right.row || left.column - right.column);
  const ranges = [];
  for (const { column, row } of coordinates) {
    const previous = ranges.at(-1);
    if (previous && previous[0] === row && previous[2] + 1 === column) previous[2] = column;
    else ranges.push([row, column, column]);
  }
  return ranges;
};

export const readIsometricOutput = (root) => {
  const mapInfo = JSON.parse(readFileSync(join(root, "map_info.json"), "utf8"));
  const floors = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^layer-?\d+[.]dzi$/.test(entry.name))
    .map((entry) => {
      const floor = Number(entry.name.match(/^layer(-?\d+)[.]dzi$/)?.[1]);
      const definition = readFileSync(join(root, entry.name), "utf8");
      const tileSize = Number(definition.match(/TileSize="(\d+)"/)?.[1]);
      const format = definition.match(/Format="([^"]+)"/)?.[1];
      const width = Number(definition.match(/Width="(\d+)"/)?.[1]);
      const height = Number(definition.match(/Height="(\d+)"/)?.[1]);
      const tileDirectory = join(root, `layer${floor}_files`);
      const levelEntries = readdirSync(tileDirectory, { withFileTypes: true })
        .filter((item) => item.isDirectory() && /^\d+$/.test(item.name))
        .map((item) => ({
          level: Number(item.name),
          ranges: getTileRanges(join(tileDirectory, item.name), format),
        }))
        .filter(({ ranges }) => ranges.length > 0)
        .sort((left, right) => left.level - right.level);
      const levels = levelEntries.map(({ level }) => level);
      const pyramidMaximumLevel = Math.ceil(Math.log2(Math.max(width, height)));
      const tileRanges = Object.fromEntries(
        levelEntries.map(({ level, ranges }) => [String(level), ranges]),
      );
      if (!Number.isInteger(tileSize) || !format || !Number.isInteger(width) || !Number.isInteger(height)) {
        throw new Error(`Invalid DZI definition for floor ${floor}.`);
      }
      return {
        floor,
        tileSize,
        format,
        width,
        height,
        levels,
        ...(pyramidMaximumLevel !== levels.at(-1) ? { pyramidMaximumLevel } : {}),
        tileRanges,
      };
    })
    .filter((floor) => floor.levels.length > 0)
    .sort((left, right) => right.floor - left.floor);
  if (floors.length === 0) throw new Error(`No rendered isometric floors were found at ${root}.`);
  return { mapInfo, floors };
};
