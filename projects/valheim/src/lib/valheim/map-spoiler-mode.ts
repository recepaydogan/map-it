export const MAP_SPOILER_MODES = ['full', 'terrain', 'personal'] as const
export type MapSpoilerMode = typeof MAP_SPOILER_MODES[number]

/** Existing on/off preferences keep their meaning when the third option arrives. */
export function resolveMapSpoilerMode(value: unknown): MapSpoilerMode {
  const state = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  if (MAP_SPOILER_MODES.includes(state.spoilerMode as MapSpoilerMode)) return state.spoilerMode as MapSpoilerMode
  return state.showSpoilers === false ? 'personal' : 'full'
}
