import projection from "../../../public/data/live-position-projection.json";

/** Same UiMapAssignment/ADT projection used to place the bundled map markers. */
export const projectPlayerPosition = (worldMapId: number, worldX: number, worldY: number) => {
  if (![worldX, worldY].every(Number.isFinite)) return null;
  const layer = projection.layers.find((entry) => entry.source.mapId === worldMapId);
  if (!layer) return null;
  const source = layer.source;
  if (source.placement === "overview-inset" && source.grid && source.adtWorldSize) {
    return {
      mapId: projection.mapId,
      x: layer.originX + (32 - worldY / source.adtWorldSize - source.grid.minX) * layer.tileSize * layer.scaleX,
      y: layer.originY + (32 - worldX / source.adtWorldSize - source.grid.minY) * layer.tileSize * layer.scaleY,
    };
  }
  if (!source.uiMin || !source.uiMax || !source.worldRegion) return null;
  const { uiMin, uiMax, worldRegion: region } = source;
  const { bounds } = projection;
  return {
    mapId: projection.mapId,
    x: (uiMin[0]! + (region[4]! - worldY) / (region[4]! - region[1]!) * (uiMax[0]! - uiMin[0]!))
      * (bounds.maxX - bounds.minX) + bounds.minX,
    y: (uiMin[1]! + (region[3]! - worldX) / (region[3]! - region[0]!) * (uiMax[1]! - uiMin[1]!))
      * (bounds.maxY - bounds.minY) + bounds.minY,
  };
};
