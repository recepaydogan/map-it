import type { ValheimWorldSave } from '../../types/world-save.ts'

/**
 * Prefer the world with the greatest persisted game clock. Array order is the
 * stable tie-breaker and the fallback when no save exposes a usable clock.
 */
export function chooseAutomaticWorld(
  worlds: readonly ValheimWorldSave[],
): ValheimWorldSave | null {
  if (worlds.length === 0) return null

  let choice: ValheimWorldSave | null = null
  let longestTime = Number.NEGATIVE_INFINITY
  for (const world of worlds) {
    const time = world.worldTimeSeconds
    if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) continue
    if (choice === null || time > longestTime) {
      choice = world
      longestTime = time
    }
  }
  return choice ?? worlds[0]
}
