import type {
  MapIsometricFloor,
  MapIsometricManifest,
} from "./map-isometric-types";

export interface MapIsometricFloorLayer {
  definition: MapIsometricFloor;
  floor: number;
  layerName: string;
}

const createFloorLayer = (definition: MapIsometricFloor): MapIsometricFloorLayer => ({
  definition,
  floor: definition.floor,
  layerName: `layer${definition.floor}`,
});

export const getWantedIsometricFloorLayers = (
  source: MapIsometricManifest,
  floor: number,
): MapIsometricFloorLayer[] => {
  if (floor < 0) {
    const definition = source.floors.find((candidate) => candidate.floor === floor);
    return definition ? [createFloorLayer(definition)] : [];
  }

  const cumulativeFloor = floor > 0
    ? source.cumulativeFloors?.find((candidate) => candidate.floor === floor)
    : undefined;
  if (cumulativeFloor) {
    const groundFloor = source.floors.find((candidate) => candidate.floor === 0);
    return [
      ...(groundFloor ? [createFloorLayer(groundFloor)] : []),
      {
        definition: cumulativeFloor,
        floor: cumulativeFloor.floor,
        layerName: cumulativeFloor.layerName,
      },
    ];
  }

  return source.floors
    .filter((candidate) => candidate.floor >= 0 && candidate.floor <= floor)
    .sort((left, right) => left.floor - right.floor)
    .map(createFloorLayer);
};
