export const formatErMapMarkerName = (name: string, placementCount?: number) =>
  placementCount && placementCount > 1 ? `${name} ×${placementCount}` : name;
