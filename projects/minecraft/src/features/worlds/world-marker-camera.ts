import type { BiomeCanvasState } from "../generation/biome-canvas";

/** The selected marker lands beside its panel, with the same 72px gap as ER. */
export const worldMarkerCameraTarget = (
  markerX: number,
  markerZ: number,
  view: Pick<BiomeCanvasState, "zoom" | "width">,
  mapLeft: number,
  panelRight: number | null,
) => {
  const desiredX = panelRight === null ? view.width * 0.42
    : Math.min(view.width - 80, Math.max(80, panelRight - mapLeft + 72));
  return { x: markerX + (view.width / 2 - desiredX) / view.zoom, z: markerZ };
};
