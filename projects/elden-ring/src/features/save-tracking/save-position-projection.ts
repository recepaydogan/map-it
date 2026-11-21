import { NOMINAL_SIZE } from "../../data/maps";
import type { PlayerMarker } from "../../store/map-store";
import { area12BlockWorlds, legacyBlockWorlds } from "../er-map/er-map-data";
import { TEST_MAP_LAYERS, worldPositionFor } from "../er-map/raw-coordinate-system";
import type { ErMapLayer } from "../er-map/types";
import type { SavedCharacter } from "./types";

export const projectSavedPosition = (character: SavedCharacter | null): PlayerMarker | null => {
  if (!character || !character.map.every((value, index) => value === character.headerMap[index])) return null;
  const [area, gridX, gridZ, variant] = character.map;
  let layer: ErMapLayer;
  let x: number;
  let z: number;
  if (area === 60 || area === 61) {
    // Only small world tiles have the verified 256-unit coordinate frame.
    if (variant !== 0) return null;
    layer = area === 60 ? "overworld" : "dlc-realm-of-shadow";
    x = (gridX - 16) * 256 + character.x;
    z = (gridZ - 16) * 256 + character.z;
  } else if (area === 12) {
    const block = area12BlockWorlds[String(gridX)];
    if (!block) return null;
    layer = "underground";
    x = block.worldX + character.x;
    z = block.worldZ + character.z;
  } else {
    const block = legacyBlockWorlds[`${area}:${gridX}`];
    if (!block) return null;
    layer = block.surface === 61 ? "dlc-realm-of-shadow" : "overworld";
    x = block.worldX + character.x;
    z = block.worldZ + character.z;
  }
  const definition = TEST_MAP_LAYERS[layer];
  const position = worldPositionFor(x, z, definition);
  if (position.outsideCanvas) return null;
  return {
    game: "elden-ring", layer,
    pixel: { x: position.x / definition.imageWidth * NOMINAL_SIZE, y: position.y / definition.imageHeight * NOMINAL_SIZE },
  };
};
