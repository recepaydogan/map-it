export const getMapMarkerIconSize = (markerSize: number, itemArt: boolean, selected = false) =>
  Math.min(itemArt ? (selected ? 28 : 25) : (selected ? 24 : 21), markerSize - 4);
