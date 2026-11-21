import type { ValheimWorldSave } from '../../types/world-save.ts'
import { getStableHashCode } from './stable-hash.ts'

export interface WorldIdentity { name: string; seedName: string; saveId?: string }
export const worldIdentityKey = (world: WorldIdentity) => JSON.stringify([world.name, world.seedName])
export const rememberedWorldId = (world: WorldIdentity) => `remembered:${worldIdentityKey(world)}`

export function parseKnownWorlds(raw: string | null): WorldIdentity[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((entry): entry is WorldIdentity => Boolean(entry)
      && typeof entry.name === 'string' && entry.name.trim().length > 0
      && typeof entry.seedName === 'string' && entry.seedName.trim().length > 0
      && (entry.saveId === undefined || typeof entry.saveId === 'string'))
  } catch { return [] }
}

export function rememberWorlds(previous: WorldIdentity[], incoming: WorldIdentity[]): WorldIdentity[] {
  const merged = new Map(previous.map(world => [worldIdentityKey(world), world]))
  for (const world of incoming) {
    if (!world.name.trim() || !world.seedName.trim()) continue
    const key = worldIdentityKey(world)
    merged.set(key, { ...merged.get(key), ...world })
  }
  const result = [...merged.values()]
  return JSON.stringify(previous) === JSON.stringify(result) ? previous : result
}

/** Remembered entries generate a seed map; they never pretend to have a save DB. */
export function mergeKnownWorlds(saves: ValheimWorldSave[], known: WorldIdentity[]): ValheimWorldSave[] {
  const keys = new Set(saves.map(world => worldIdentityKey(world)))
  return [...saves, ...known.filter(world => !keys.has(worldIdentityKey(world))).map(world => ({
    id: world.saveId ?? rememberedWorldId(world), fileName: world.name,
    name: world.name, seedName: world.seedName, seed: getStableHashCode(world.seedName),
    uid: '', worldVersion: 0, worldGenVersion: 0, needsDatabase: false,
    fwlPath: '', databasePath: null, worldTimeSeconds: null, source: 'remembered' as const,
  }))].sort((a, b) => a.name.localeCompare(b.name) || a.seedName.localeCompare(b.seedName))
}

export function findLiveWorld(worlds: ValheimWorldSave[], identity: WorldIdentity): ValheimWorldSave | null {
  const matches = worlds.filter(world => worldIdentityKey(world) === worldIdentityKey(identity))
  // The bridge does not yet provide a world UID in its position payload.
  // Ambiguous saves must not silently attach another world's database.
  return matches.length === 1 ? matches[0] : null
}

export function chooseNewLiveWorld(worlds: ValheimWorldSave[], identity: WorldIdentity, handledKey: string | null) {
  return handledKey === worldIdentityKey(identity) ? null : findLiveWorld(worlds, identity)
}

/** Upgrade a selected seed-only entry when its committed save becomes available. */
export function resolveSelectedWorld(worlds: ValheimWorldSave[], known: WorldIdentity[], id: string | null) {
  const exact = worlds.find(world => world.id === id)
  if (exact) return exact
  const identity = known.find(world => rememberedWorldId(world) === id || world.saveId === id)
  return identity ? findLiveWorld(worlds, identity) : null
}
