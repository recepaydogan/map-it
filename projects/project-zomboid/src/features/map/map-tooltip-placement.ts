export const MAP_TOOLTIP_WIDTH = 214;
/** Matches the toolbar panels, so every floating map card is the same width. */
export const MAP_PIN_PANEL_WIDTH = 304;

const CURSOR_OFFSET = 16;
const EDGE_PADDING = 10;
/** Clears the largest pin disc the overlays draw, plus a little air. */
const PIN_GAP = 26;
/** Under this a panel above the pin would be a sliver, so it flips below. */
const PIN_PANEL_MIN_HEIGHT = 220;
/** Rough card height, only used to keep a tall card off the bottom edge. */
const RESERVED_HEIGHT = 160;

/**
 * Places a cursor-following card inside the viewport. It flips across the
 * cursor rather than clamping sideways, so the card never covers the thing it
 * is describing.
 */
export const getMapTooltipPlacement = (
  cursorLeft: number,
  cursorTop: number,
  width: number,
  height: number,
) => {
  const flip = cursorLeft + CURSOR_OFFSET + MAP_TOOLTIP_WIDTH + EDGE_PADDING > width;
  const left = flip
    ? cursorLeft - CURSOR_OFFSET - MAP_TOOLTIP_WIDTH
    : cursorLeft + CURSOR_OFFSET;
  return {
    left: Math.max(EDGE_PADDING, left),
    top: Math.min(
      Math.max(cursorTop + CURSOR_OFFSET, EDGE_PADDING),
      Math.max(EDGE_PADDING, height - RESERVED_HEIGHT),
    ),
  };
};

/**
 * Anchors a panel to a pin: centred over it and sitting just above it, so the
 * card and the thing it describes read as one object. It flips below when the
 * pin is too close to the top edge, and is capped to the room it has, so a tall
 * list scrolls inside the panel instead of running off the map.
 *
 * The above case is expressed as `bottom`, which lets the panel grow upward
 * from the pin without anyone having to measure its height first.
 */
export const getMapPinPanelPlacement = (
  pinLeft: number,
  pinTop: number,
  width: number,
  height: number,
) => {
  const spaceAbove = pinTop - PIN_GAP - EDGE_PADDING;
  const spaceBelow = height - pinTop - PIN_GAP - EDGE_PADDING;
  const above = spaceAbove >= Math.min(PIN_PANEL_MIN_HEIGHT, spaceBelow);
  const maximumLeft = Math.max(EDGE_PADDING, width - MAP_PIN_PANEL_WIDTH - EDGE_PADDING);
  return {
    width: MAP_PIN_PANEL_WIDTH,
    left: Math.min(Math.max(pinLeft - MAP_PIN_PANEL_WIDTH / 2, EDGE_PADDING), maximumLeft),
    ...(above
      ? { bottom: Math.max(EDGE_PADDING, height - pinTop + PIN_GAP) }
      : { top: Math.max(EDGE_PADDING, pinTop + PIN_GAP) }),
    maxHeight: Math.max(PIN_PANEL_MIN_HEIGHT, above ? spaceAbove : spaceBelow),
  };
};
