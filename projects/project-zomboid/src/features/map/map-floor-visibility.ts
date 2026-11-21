export interface FloorAwarePoint {
  floors?: number[];
}

export const getPointFloors = ({ floors }: FloorAwarePoint) => floors ?? [0];

export const isPointOnFloor = (point: FloorAwarePoint, floor: number) =>
  getPointFloors(point).includes(floor);

export const isPointVisibleOnFloor = (point: FloorAwarePoint, activeFloor: number) => {
  if (activeFloor < 0) return isPointOnFloor(point, activeFloor);
  return getPointFloors(point).some((floor) => floor >= 0);
};

export const getSearchResultBasementFloors = (point: FloorAwarePoint) => {
  const floors = getPointFloors(point);
  if (floors.some((floor) => floor >= 0)) return [];
  return [...new Set(floors.filter((floor) => floor < 0))]
    .sort((left, right) => right - left);
};

export const getSearchSelectionFloor = (point: FloorAwarePoint, activeFloor: number) => {
  const basementFloors = getSearchResultBasementFloors(point);
  if (basementFloors.length > 0) return basementFloors[0]!;
  return activeFloor < 0 ? 0 : activeFloor;
};

export const getSearchFloorGroupKey = (point: FloorAwarePoint) => {
  const basementFloors = getSearchResultBasementFloors(point);
  return basementFloors.length > 0 ? basementFloors.join(",") : "surface";
};

export const MAXIMUM_POSITIVE_MAP_FLOOR = 9;

export const getSelectableMapFloors = (floors: number[]) => [...new Set(
  floors.filter((floor) => floor <= MAXIMUM_POSITIVE_MAP_FLOOR),
)].sort((left, right) => left - right);
