import type { SVGProps } from 'react'

/**
 * Map glyphs for the location kinds the game has no map icon for, drawn in
 * the same language as Valheim's own `mapicon_*` sprites: a bold white
 * silhouette on a 24×24 grid, no strokes, so they sit next to the game's
 * icons without looking like a different family.
 */
export type MarkerGlyphName =
  | 'tower'
  | 'ruin'
  | 'runestone'
  | 'stones'
  | 'well'
  | 'ship'
  | 'grave'
  | 'sword'
  | 'skull'
  | 'statue'
  | 'bridge'
  | 'spire'
  | 'cave'
  | 'lava'
  | 'tar'
  | 'nest'
  | 'tree'
  | 'lantern'

const PATHS: Record<MarkerGlyphName, string> = {
  // Crenellated keep on a plinth.
  tower: 'M6 3h2.4v2.2h2.4V3h2.4v2.2h2.4V3H18v5l-1.4 1.4V17H19v3H5v-3h2.4V9.4L6 8z',
  // Broken wall: two standing stubs, one collapsed course.
  ruin: 'M3 21v-3h18v3zM4 17V8l2-1.5 1.5 1.5L9 6.5l2 1.5V17zM13 17v-6l1.8-1.6 1.7 1.6 1.6-1.6L20 11v6z',
  // Standing stone with an algiz (ᛉ) carving.
  runestone: 'M12 2.5c4.2 0 7.3 2.6 7.3 6.2v10.1c0 1.5-1 2.5-2.5 2.5H7.2c-1.5 0-2.5-1-2.5-2.5V8.7c0-3.6 3.1-6.2 7.3-6.2zM11.1 6h1.8v12.7h-1.8zM11.1 10.4L7.3 7.7l.9-1.3 2.9 2.1zM12.9 10.4l3.8-2.7-.9-1.3-2.9 2.1z',
  // Three menhirs.
  stones: 'M3 20v-9l2.5-3L8 11v9zM9.5 20V6.5L12 3l2.5 3.5V20zM16 20v-9l2.5-3L21 11v9z',
  // Stone well with a roof.
  well: 'M12 2l7 5.5v1.8H5V7.5zM6.5 10.5h11V13h-11zM7.5 13.5h9V19h2v2h-13v-2h2z',
  // Longship hull with sail.
  ship: 'M11 3h2v9h5.5c-.6-3.6-3-6.4-5.5-7.6V3zM3 14h18l-2 3.5c-.4.7-1.1 1.2-1.9 1.2H6.9c-.8 0-1.5-.5-1.9-1.2z',
  // Rounded headstone on a mound.
  grave: 'M8 20v-9c0-2.6 1.8-4.5 4-4.5s4 1.9 4 4.5v9zM11.2 10.5v1.8H9.5v1.6h1.7V17h1.6v-3.1h1.7v-1.6h-1.7v-1.8zM4 22v-2h16v2z',
  // Sword driven into the ground.
  sword: 'M12 2l1.4 3v7.5h3.1V15h-3.1v3.6c0 .9-.6 1.6-1.4 1.9-.8-.3-1.4-1-1.4-1.9V15H7.5v-2.5h3.1V5z',
  // Giant skull.
  skull: 'M12 3c4.6 0 8 3.2 8 7.4 0 2.3-1 4.1-2.5 5.3V19c0 1.1-.9 2-2 2h-7c-1.1 0-2-.9-2-2v-3.3C5 14.5 4 12.7 4 10.4 4 6.2 7.4 3 12 3zM8.8 9.2c-1.1 0-1.9.9-1.9 2s.8 2 1.9 2 1.9-.9 1.9-2-.8-2-1.9-2zm6.4 0c-1.1 0-1.9.9-1.9 2s.8 2 1.9 2 1.9-.9 1.9-2-.8-2-1.9-2zM12 13.6l1.4 2.4h-2.8z',
  // Carved head on a plinth.
  statue: 'M12 2.5c2.5 0 4.2 1.9 4.2 4.4 0 1.5-.6 2.8-1.6 3.6l1.6 2.6h-8.4l1.6-2.6c-1-.8-1.6-2.1-1.6-3.6C7.8 4.4 9.5 2.5 12 2.5zM8 14.5h8V17H8zM6 18h12v3H6z',
  // Arched viaduct.
  bridge: 'M2 8h20v2.5h-1.5V20H18v-9.5c-2 0-3.5 1.4-3.5 3.5V20h-5v-6c0-2.1-1.5-3.5-3.5-3.5V20H3.5v-9.5H2z',
  // Rock spire.
  spire: 'M12 2l3 9 1.5-2 3.5 12H4L7.5 9 9 11z',
  // Cave mouth in a hill.
  cave: 'M2 20C2 11.5 6.5 4 12 4s10 7.5 10 16zM12 11c-2.4 0-4 2.4-4 5.5V20h8v-3.5c0-3.1-1.6-5.5-4-5.5z',
  // Molten pool.
  lava: 'M12 2c1 2.8 3.4 4.4 3.4 7.2 0 1.9-1.5 3.4-3.4 3.4S8.6 11.1 8.6 9.2C8.6 6.4 11 4.8 12 2zM3 16c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0v2.5c-2 1.6-4 1.6-6 0s-4-1.6-6 0-4 1.6-6 0zM3 20.5c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0V22H3z',
  // Tar drop.
  tar: 'M12 2c3.5 5 6.5 8.5 6.5 12.5 0 3.9-2.9 6.5-6.5 6.5s-6.5-2.6-6.5-6.5C5.5 10.5 8.5 7 12 2zm-2.5 12.2c-.7 0-1.2.6-1.2 1.4 0 1.9 1.4 3.4 3.2 3.6v-1.5c-1-.2-1.6-1-1.6-2.1 0-.8-.1-1.4-.4-1.4z',
  // Egg in a nest.
  nest: 'M12 3c2.6 0 4.5 3 4.5 6.5S14.6 15 12 15s-4.5-2-4.5-5.5S9.4 3 12 3zM3 15.5h18c-.5 3.3-4.3 5.5-9 5.5s-8.5-2.2-9-5.5z',
  // Gnarled tree.
  tree: 'M11 21v-5.2c-2.6-.3-4.9-1.4-6.4-3.1l1.5-1.5c1 1 2.2 1.6 3.4 1.9L7.5 8.6l1.6-1.4 2 4.6V3h1.8v6.4l2.2-3.6 1.6 1L14 11.6c1.4-.2 2.7-.9 3.8-2l1.5 1.5c-1.7 1.9-4 3-6.5 3.2V21z',
  // Hanging lantern.
  lantern: 'M11 2h2v2h2.5v2H8.5V4H11zM8 7h8l1 2v6l-1 2H8l-1-2V9zM10 8.8v6.4h4V8.8zM9.5 18h5v3h-5z',
}

export function MarkerGlyph({ name, size = 16, ...rest }: { name: MarkerGlyphName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} fillRule="evenodd" />
    </svg>
  )
}
