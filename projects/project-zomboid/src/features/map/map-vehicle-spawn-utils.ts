import type {
  MapCoordinate,
  MapVehicleSpawnData,
  MapVehicleSpawnDefinition,
  MapVehicleSpawnZone,
} from "./types";

export interface MapVehicleSpawnHit {
  definition: MapVehicleSpawnDefinition;
  /** The exact rectangle under the cursor, so the layer can highlight that one. */
  zone: MapVehicleSpawnZone;
}

/**
 * The zone under the cursor, or the nearest one inside the grab radius. A zone
 * the cursor actually sits in scores zero distance, so it always wins over a
 * neighbour that the tolerance happens to reach.
 *
 * `tolerance` is in world units — pass a pixel radius through
 * {@link getWorldUnitsPerPixel} so the grab stays constant on screen.
 */
export const findVehicleSpawnAtCoordinate = (
  data: MapVehicleSpawnData,
  coordinate: MapCoordinate,
  tolerance: number,
): MapVehicleSpawnHit | null => {
  let nearest: { hit: MapVehicleSpawnHit; distance: number } | null = null;

  for (const zone of data.zones) {
    const [definitionIndex, x, y, width, height] = zone;
    const deltaX = Math.max(x - coordinate.x, 0, coordinate.x - (x + width));
    const deltaY = Math.max(y - coordinate.y, 0, coordinate.y - (y + height));
    const distance = Math.hypot(deltaX, deltaY);
    if (distance > tolerance || (nearest && distance >= nearest.distance)) continue;
    const definition = data.definitions[definitionIndex];
    if (definition) nearest = { hit: { definition, zone }, distance };
  }

  return nearest?.hit ?? null;
};
