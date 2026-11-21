export function extractCreatureTransitions(characters: Array<{
  prefabName: string
  components?: unknown[]
}>): Record<string, string[]>
export function collectEncounterDrops<T extends { chance?: number; amountMax?: number; amountMin?: number }>(
  prefab: string,
  characters: Record<string, { drops: T[] }>,
  transitions: Record<string, string[]>,
): T[]
