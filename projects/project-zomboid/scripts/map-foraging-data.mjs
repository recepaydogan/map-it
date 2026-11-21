import { parseMapObjects } from "./map-objects-parser.mjs";

export const FORAGING_ZONE_TYPES = [
  "Nav",
  "TownZone",
  "TrailerPark",
  "FarmLand",
  "Farm",
  "Vegitation",
  "Forest",
  "DeepForest",
];

const createEmptyZoneRecord = () => Object.fromEntries(
  FORAGING_ZONE_TYPES.map((type) => [type, []]),
);

const parseZoneDefinitions = (source) => Object.fromEntries(
  FORAGING_ZONE_TYPES.map((type) => {
    const definitionStart = source.indexOf(`\n\t${type} = {`);
    if (definitionStart < 0) throw new Error(`Foraging definition ${type} was not found.`);
    const definition = source.slice(definitionStart, definitionStart + 500);
    const densityMin = Number(definition.match(/densityMin\s*=\s*(\d+(?:\.\d+)?)/)?.[1]);
    const densityMax = Number(definition.match(/densityMax\s*=\s*(\d+(?:\.\d+)?)/)?.[1]);
    const refillPercent = Number(definition.match(/refillPercent\s*=\s*(\d+(?:\.\d+)?)/)?.[1]);
    if (![densityMin, densityMax, refillPercent].every(Number.isFinite)) {
      throw new Error(`Foraging density for ${type} could not be parsed.`);
    }
    return [type, { densityMin, densityMax, refillPercent }];
  }),
);

export const buildMapForagingData = (objectsSource, definitionsSource) => {
  const zones = createEmptyZoneRecord();
  let totalZones = 0;

  for (const { type, x, y, z, width, height } of parseMapObjects(objectsSource)) {
    if (!(type in zones) || z !== 0) continue;
    zones[type].push([x, y, width, height]);
    totalZones += 1;
  }

  return {
    definitions: parseZoneDefinitions(definitionsSource),
    zones,
    totalZones,
  };
};
