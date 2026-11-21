import { isPointOnFloor, type FloorAwarePoint } from "./map-floor-visibility.ts";

interface FloorAwareMapData<TLocation extends FloorAwarePoint> {
  locations: TLocation[];
  statistics: {
    searchableLocations: number;
  };
}

export const isGroundFloorLocation = (location: FloorAwarePoint) =>
  isPointOnFloor(location, 0);

export const filterMapDataToGroundFloor = <
  TLocation extends FloorAwarePoint,
  TData extends FloorAwareMapData<TLocation>,
>(data: TData): TData => {
  const locations = data.locations.filter(isGroundFloorLocation);
  if (locations.length === data.locations.length) return data;
  return {
    ...data,
    locations,
    statistics: {
      ...data.statistics,
      searchableLocations: locations.length,
    },
  };
};
