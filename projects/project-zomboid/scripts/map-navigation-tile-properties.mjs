import {
  NAVIGATION_EDGE_BLOCKED,
  NAVIGATION_EDGE_CLIMB,
  NAVIGATION_EDGE_DOOR,
  NAVIGATION_EDGE_OPEN,
} from "./map-navigation-format.mjs";
import { parseTileDefinitions } from "./map-tile-definitions-parser.mjs";

const hasAny = (properties, names) => names.some((name) => Object.hasOwn(properties, name));

const edgeKind = (properties, direction) => {
  if (hasAny(properties, [
    `door${direction}`,
    `Door${direction}`,
    `DoorWall${direction}`,
  ])) return NAVIGATION_EDGE_DOOR;
  if (hasAny(properties, [
    `Hoppable${direction}`,
    `TallHoppable${direction}`,
    `Window${direction}`,
    `window${direction}`,
  ])) return NAVIGATION_EDGE_CLIMB;
  if (hasAny(properties, [
    `Wall${direction}`,
    `Wall${direction}Trans`,
    "WallNW",
    "WallNWTrans",
  ])) return NAVIGATION_EDGE_BLOCKED;
  return NAVIGATION_EDGE_OPEN;
};

export const buildNavigationTileProperties = (sources) => {
  const navigationTiles = new Map();
  for (const [tileName, properties] of parseTileDefinitions(sources)) {
    const north = edgeKind(properties, "N");
    const west = edgeKind(properties, "W");
    const hasEdge = north !== NAVIGATION_EDGE_OPEN || west !== NAVIGATION_EDGE_OPEN;
    navigationTiles.set(tileName, {
      north,
      west,
      blocked: !hasEdge && hasAny(properties, ["solid", "solidtrans"]),
      water: Object.hasOwn(properties, "water"),
      floor: Object.hasOwn(properties, "solidfloor"),
      // `vegitation` is also present on harmless ground cover. Movement/Bush
      // and tree identify vegetation that actually impedes a character.
      slow: hasAny(properties, ["Movement", "Bush", "tree"]),
    });
  }
  return navigationTiles;
};
