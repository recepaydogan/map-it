/** Map badge order, from background to foreground. Interaction states outrank content types. */
export const MAP_MARKER_STACK = {
  resources: 10,
  creatures: 20,
  discoveries: 30,
  structures: 40,
  npcs: 50,
  dungeons: 60,
  personal: 70,
  bosses: 80,
  player: 90,
  selected: 100,
  hovered: 110,
  openCard: 130,
  fan: 140,
} as const
