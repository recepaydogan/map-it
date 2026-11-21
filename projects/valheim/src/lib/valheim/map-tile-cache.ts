import { createIndexedKvStore } from '../storage/indexed-kv'

const store = createIndexedKvStore<Blob>(
  'valheim-companion-map-tiles',
  'tiles',
  (value): value is Blob => value instanceof Blob,
  'Map tile cache',
)

/**
 * Ceiling on stored tiles. The deepest detail level alone can address 4096
 * tiles per seed, so a player who pans across the whole world at full zoom
 * would otherwise leave tens of megabytes behind.
 */
const MAX_STORED_TILES = 3_000

export const readMapTile = (key: string): Promise<Blob | null> => store.get(key)
export const writeMapTile = (key: string, blob: Blob): Promise<void> => store.put(key, blob)

/** Keys look like `v3:<seed>:<grid count>:<column>:<row>:<resolution>`. */
const evictionRank = (key: string, seedName: string) => {
  const parts = key.split(':')
  const level = Number(parts[2])
  return (parts[1] === seedName ? 0 : 1_000) + (Number.isFinite(level) ? level : -1)
}

/**
 * Best-effort housekeeping, meant to run once per session away from the
 * critical path. There are no timestamps to age entries by, so eviction follows
 * a fixed priority: entries written by an earlier cache version go first, then
 * other seeds, then the deepest detail levels — the most numerous tiles and the
 * least likely to be revisited.
 */
export async function pruneMapTiles(versionPrefix: string, seedName: string): Promise<void> {
  const keys = await store.keys()
  const current = keys.filter((key) => key.startsWith(versionPrefix))
  const doomed = keys.filter((key) => !key.startsWith(versionPrefix))
  const excess = current.length - MAX_STORED_TILES
  if (excess > 0) {
    doomed.push(...current
      .sort((first, second) => evictionRank(second, seedName) - evictionRank(first, seedName))
      .slice(0, excess))
  }
  for (const key of doomed) await store.delete(key)
}
