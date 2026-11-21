import { getMapDataUrl } from "./map-data-url";

/**
 * The overlay's own pin glyph, imported from the game's map symbol set. A star
 * rather than a building symbol: it marks where a run begins, and none of the
 * location categories claim it. Shared by the canvas layer, the cursor card and
 * the detail panel, so all three show the same pin.
 */
export const SPAWN_POINT_ICON = getMapDataUrl("icons/spawn-point.png");
