import {
  CONTAINERS_PAYLOAD_VERSION,
  type ContainerSourceSelection,
  type LiveContainer,
  type LiveContainerItem,
  type LiveContainersSnapshot,
  type RememberedContainer,
} from './container-types.ts'

export type ContainersReadResult =
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'unsupported-payload'; payloadVersion: number }
  | { kind: 'sharing-off'; updatedAt: number }
  | { kind: 'snapshot'; snapshot: LiveContainersSnapshot }

const asString = (value: unknown) => (typeof value === 'string' ? value : '')
const asNumber = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const parseItems = (value: unknown): LiveContainerItem[] => {
  if (!Array.isArray(value)) return []
  const items: LiveContainerItem[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const prefab = asString(record.prefab)
    const amount = asNumber(record.amount)
    if (!prefab || amount === null || amount <= 0) continue
    const quality = asNumber(record.quality)
    items.push({
      prefab,
      amount: Math.floor(amount),
      quality: quality !== null && quality > 0 ? Math.floor(quality) : 1,
    })
  }
  return items
}

const parseContainers = (value: unknown): LiveContainer[] => {
  if (!Array.isArray(value)) return []
  const containers: LiveContainer[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const id = asString(record.id)
    const x = asNumber(record.x)
    const y = asNumber(record.y)
    const z = asNumber(record.z)
    if (!id || x === null || y === null || z === null) continue
    const owner = record.owner === 'own' ? 'own' : 'other'
    containers.push({
      id,
      prefab: asString(record.prefab),
      name: asString(record.name),
      owner,
      creator: asString(record.creator),
      x,
      y,
      z,
      private: record.private === true,
      loaded: record.loaded === true,
      items: parseItems(record.items),
    })
  }
  return containers
}

/** Validates one payload; anything unexpected is a typed result, never a throw. */
export function parseContainersPayload(raw: string | null): ContainersReadResult {
  if (raw === null || raw.trim() === '') return { kind: 'missing' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.error('[Container tracking] Invalid containers payload', error)
    return { kind: 'invalid' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'invalid' }
  const record = parsed as Record<string, unknown>
  const payloadVersion = asNumber(record.payloadVersion)
  if (payloadVersion === null) return { kind: 'invalid' }
  if (payloadVersion > CONTAINERS_PAYLOAD_VERSION) return { kind: 'unsupported-payload', payloadVersion }
  const updatedAt = asNumber(record.updatedAt)
  if (updatedAt === null) return { kind: 'invalid' }
  if (record.sharing === false) return { kind: 'sharing-off', updatedAt }
  return {
    kind: 'snapshot',
    snapshot: {
      payloadVersion,
      sharing: true,
      updatedAt,
      worldName: asString(record.worldName),
      worldUid: asString(record.worldUid),
      seedName: asString(record.seedName),
      characterId: asString(record.characterId),
      containers: parseContainers(record.containers),
      removed: Array.isArray(record.removed) ? record.removed.filter((id): id is string => typeof id === 'string') : [],
    },
  }
}

/** Which containers count, given the player's source settings. */
export const containerCounts = (container: { owner: LiveContainer['owner'] }, sources: ContainerSourceSelection) =>
  container.owner === 'own' ? sources.ownContainers : sources.friendContainers

/** Sums container contents into owned amounts per lowercased prefab. */
export function containersToStock(
  containers: readonly LiveContainer[],
  sources: ContainerSourceSelection,
): Record<string, number> {
  const stock: Record<string, number> = {}
  for (const container of containers) {
    if (!containerCounts(container, sources)) continue
    for (const item of container.items) {
      const key = item.prefab.toLowerCase()
      stock[key] = (stock[key] ?? 0) + item.amount
    }
  }
  return stock
}

/** One container that holds some of a material, for "which chest" answers. */
export interface ContainerHolding {
  container: RememberedContainer
  amount: number
  distance: number
}

/**
 * Containers holding `prefabName`, nearest to `origin` first. Only containers
 * the settings allow to count are listed, so the answer matches the numbers.
 */
export function holdingsFor(
  containers: readonly RememberedContainer[],
  prefabName: string,
  sources: ContainerSourceSelection,
  origin: { x: number; z: number },
): ContainerHolding[] {
  const key = prefabName.toLowerCase()
  const holdings: ContainerHolding[] = []
  for (const container of containers) {
    if (!containerCounts(container, sources)) continue
    let amount = 0
    for (const item of container.items) if (item.prefab.toLowerCase() === key) amount += item.amount
    if (amount <= 0) continue
    holdings.push({
      container,
      amount,
      distance: Math.hypot(container.x - origin.x, container.z - origin.z),
    })
  }
  return holdings.sort((first, second) => first.distance - second.distance)
}

/**
 * Applies one snapshot to the remembered set for its world: every reported
 * container is upserted, every id the mod flagged as removed is dropped.
 * Containers the mod no longer reports (new game session) are kept, because
 * the mod only knows about zones it has visited since launch.
 */
/** The mod's identity for a chest, derived the same way from the save file. */
export const containerKey = (prefab: string, x: number, y: number, z: number) =>
  `${prefab}@${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}`

/**
 * Chests lifted from the world save, shaped like the mod's records so they can
 * seed the memory; `ownPlayerIds` decides "own" vs "other".
 */
export function containersFromSave(
  saved: ReadonlyArray<{ prefabName: string; x: number; y: number; height: number; creator: string; items: Array<{ prefab: string; amount: number; quality: number }> }>,
  ownPlayerIds: ReadonlySet<string>,
  now: number,
): RememberedContainer[] {
  const result: RememberedContainer[] = []
  for (const entry of saved) {
    if (entry.creator === '0') continue // world-generated, not the player's
    result.push({
      id: containerKey(entry.prefabName, entry.x, entry.height, entry.y),
      prefab: entry.prefabName,
      name: `$${entry.prefabName}`,
      owner: ownPlayerIds.has(entry.creator) ? 'own' : 'other',
      creator: entry.creator,
      x: entry.x,
      y: entry.height,
      z: entry.y,
      private: false,
      loaded: false,
      items: entry.items.map((item) => ({ prefab: item.prefab, amount: item.amount, quality: item.quality })),
      lastSeenAt: now,
    })
  }
  return result
}

export function mergeContainerSnapshot(
  remembered: Readonly<Record<string, RememberedContainer>>,
  snapshot: LiveContainersSnapshot,
  now: number,
): Record<string, RememberedContainer> {
  // The mod heartbeats an unchanged snapshot every 15 s: keep object identity
  // for containers that did not change so nothing downstream re-renders, and
  // return the very same map when nothing changed at all.
  let changed = false
  const next: Record<string, RememberedContainer> = { ...remembered }
  for (const id of snapshot.removed) {
    if (id in next) { delete next[id]; changed = true }
  }
  for (const container of snapshot.containers) {
    const previous = next[container.id]
    if (previous && sameContainer(previous, container)) continue
    next[container.id] = { ...container, lastSeenAt: now }
    changed = true
  }
  return changed ? next : (remembered as Record<string, RememberedContainer>)
}

const sameContainer = (a: LiveContainer, b: LiveContainer): boolean => {
  if (a.x !== b.x || a.y !== b.y || a.z !== b.z || a.loaded !== b.loaded || a.private !== b.private
    || a.owner !== b.owner || a.name !== b.name || a.prefab !== b.prefab || a.items.length !== b.items.length) return false
  for (let index = 0; index < a.items.length; index += 1) {
    const left = a.items[index]
    const right = b.items[index]
    if (left.prefab !== right.prefab || left.amount !== right.amount || left.quality !== right.quality) return false
  }
  return true
}
