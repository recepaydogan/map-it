export const NAVIGATION_SCHEMA_VERSION = 1;
export const NAVIGATION_CELL_SIZE = 256;

export const NAVIGATION_EDGE_OPEN = 0;
export const NAVIGATION_EDGE_DOOR = 1;
export const NAVIGATION_EDGE_CLIMB = 2;
export const NAVIGATION_EDGE_BLOCKED = 3;

export const NAVIGATION_NORTH_SHIFT = 0;
export const NAVIGATION_WEST_SHIFT = 2;
export const NAVIGATION_EDGE_MASK = 0b11;
export const NAVIGATION_SQUARE_BLOCKED = 1 << 4;
export const NAVIGATION_SQUARE_SLOW = 1 << 5;

export const getNavigationEdge = (value, shift) =>
  (value >> shift) & NAVIGATION_EDGE_MASK;

export const setNavigationEdge = (value, shift, edge) =>
  (value & ~(NAVIGATION_EDGE_MASK << shift)) | (edge << shift);
