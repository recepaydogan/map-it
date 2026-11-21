import {
  INVENTORY_PAYLOAD_VERSION,
  type LiveInventoryItem,
  type LiveInventorySnapshot,
} from './inventory-types.ts'

export type InventoryReadResult =
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'unsupported-payload'; payloadVersion: number }
  | { kind: 'sharing-off'; updatedAt: number }
  | { kind: 'snapshot'; snapshot: LiveInventorySnapshot }

const asString = (value: unknown) => (typeof value === 'string' ? value : '')

const parseItems = (value: unknown): LiveInventoryItem[] => {
  if (!Array.isArray(value)) return []
  const items: LiveInventoryItem[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const prefab = asString(record.prefab)
    const amount = Number(record.amount)
    if (!prefab || !Number.isFinite(amount) || amount <= 0) continue
    const quality = Number(record.quality)
    items.push({
      prefab,
      amount: Math.floor(amount),
      quality: Number.isFinite(quality) && quality > 0 ? Math.floor(quality) : 1,
      equipped: record.equipped === true,
    })
  }
  return items
}

/**
 * Validates one payload written by the tracking mod. Anything unexpected is
 * reported as a typed result rather than thrown, so a corrupt file degrades the
 * planner to manual mode instead of breaking it.
 */
export function parseInventoryPayload(raw: string | null): InventoryReadResult {
  if (raw === null || raw.trim() === '') return { kind: 'missing' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.error('[Inventory tracking] Invalid inventory payload', error)
    return { kind: 'invalid' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'invalid' }

  const record = parsed as Record<string, unknown>
  const payloadVersion = Number(record.payloadVersion)
  if (!Number.isFinite(payloadVersion)) return { kind: 'invalid' }
  if (payloadVersion > INVENTORY_PAYLOAD_VERSION) {
    return { kind: 'unsupported-payload', payloadVersion }
  }
  const updatedAt = Number(record.updatedAt)
  if (!Number.isFinite(updatedAt)) return { kind: 'invalid' }
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
      characterName: asString(record.characterName),
      items: parseItems(record.items),
    },
  }
}

export interface InventorySourceSelection {
  characterInventory: boolean
  equippedItems: boolean
}

/**
 * Collapses a snapshot into owned amounts per prefab, honouring which sources
 * the player allowed to count.
 */
export function snapshotToStock(
  snapshot: LiveInventorySnapshot,
  sources: InventorySourceSelection,
): Record<string, number> {
  const stock: Record<string, number> = {}
  for (const item of snapshot.items) {
    if (item.equipped && !sources.equippedItems) continue
    if (!item.equipped && !sources.characterInventory) continue
    const key = item.prefab.toLowerCase()
    stock[key] = (stock[key] ?? 0) + item.amount
  }
  return stock
}
