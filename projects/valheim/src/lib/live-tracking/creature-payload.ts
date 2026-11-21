import {
  NEARBY_CREATURES_PAYLOAD_VERSION,
  type NearbyCreature,
  type NearbyCreaturesSnapshot,
} from './creature-types.ts'

export type NearbyCreaturesReadResult =
  | { kind: 'snapshot'; snapshot: NearbyCreaturesSnapshot }
  | { kind: 'missing' | 'invalid' | 'unsupported-payload' }

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

function parseCreatures(value: unknown): NearbyCreature[] {
  if (!Array.isArray(value)) return []
  const creatures: NearbyCreature[] = []
  for (const candidate of value) {
    const record = asRecord(candidate)
    if (!record) continue
    const id = typeof record.id === 'string' ? record.id : ''
    const prefab = typeof record.prefab === 'string' ? record.prefab : ''
    const x = Number(record.x)
    const y = Number(record.y)
    const z = Number(record.z)
    if (!id || !prefab || ![x, y, z].every(Number.isFinite)) continue
    creatures.push({
      id,
      prefab,
      name: typeof record.name === 'string' ? record.name : '',
      x,
      y,
      z,
      level: Math.max(1, Math.trunc(Number(record.level) || 1)),
      tamed: record.tamed === true,
    })
  }
  return creatures
}

export function parseNearbyCreaturesPayload(raw: string | null): NearbyCreaturesReadResult {
  if (!raw?.trim()) return { kind: 'missing' }
  try {
    const record = asRecord(JSON.parse(raw))
    if (!record) return { kind: 'invalid' }
    if (record.payloadVersion !== NEARBY_CREATURES_PAYLOAD_VERSION) return { kind: 'unsupported-payload' }
    const updatedAt = Number(record.updatedAt)
    const radius = Number(record.radius)
    if (!Number.isFinite(updatedAt) || !Number.isFinite(radius)) return { kind: 'invalid' }
    return {
      kind: 'snapshot',
      snapshot: {
        payloadVersion: NEARBY_CREATURES_PAYLOAD_VERSION,
        updatedAt,
        worldName: typeof record.worldName === 'string' ? record.worldName : '',
        worldUid: typeof record.worldUid === 'string' ? record.worldUid : '',
        seedName: typeof record.seedName === 'string' ? record.seedName : '',
        radius,
        creatures: parseCreatures(record.creatures),
      },
    }
  } catch {
    return { kind: 'invalid' }
  }
}
