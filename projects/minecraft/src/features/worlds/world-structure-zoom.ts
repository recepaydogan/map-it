import { GAME_STRUCTURE_TYPES } from "../../game-config.ts";
import { BIOME_DEFAULT_ZOOM } from "../generation/biome-viewport.ts";

const minimumZoomByType = new Map<string, number>(GAME_STRUCTURE_TYPES.map(type => [
  type.id,
  "minimumMarkerZoomPercentage" in type ? BIOME_DEFAULT_ZOOM * type.minimumMarkerZoomPercentage / 100 : 0,
]));

export const isStructureVisibleAtZoom = (type: string, zoom: number) =>
  zoom >= (minimumZoomByType.get(type) ?? 0);
