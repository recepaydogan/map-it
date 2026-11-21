import type { SavedBaseOperations, SavedPortal, SavedProductionStation } from '../../types/world-save.ts'

export const BASE_FRESHNESS_MS = 20_000
export const BASE_MEMORY_LIMIT = 10_000
export interface ObservedPiece {
  id: string
  prefabName: string
  x: number
  z: number
  yaw: number
  portal?: SavedPortal
  station?: SavedProductionStation
  observedAt: number
  worldTimeTicks: number
}
export interface BaseSnapshot {
  payloadVersion: 1
  worldUid: string
  worldName: string
  seedName: string
  updatedAt: number
  worldTimeTicks: number
  truncated: boolean
  pieces: ObservedPiece[]
  removed: string[]
}
export interface BaseMemory {
  worldUid: string
  worldName: string
  seedName: string
  updatedAt: number
  truncated: boolean
  pieces: Record<string, ObservedPiece>
}
export interface FallbackOperations {
  baseOperations: SavedBaseOperations
  updatedAt: number
  truncated: boolean
}

/** Even an empty successfully read save wins. A scan in progress is not a failure. */
export function shouldUseBaseFallback(database: unknown, discovering: boolean, reading: boolean): boolean {
  return database == null && !discovering && !reading
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 512
const numericFields = (v: Record<string, unknown>, fields: string[]) => fields.every(key => finite(v[key]))
const common = (v: Record<string, unknown>) => text(v.prefabName) && text(v.creator) && numericFields(v, ['x', 'y', 'height'])
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 128 && v.every(text)
const numbers = (v: unknown) => Array.isArray(v) && v.length <= 128 && v.every(finite)

/** Reject partial writes as a whole, so they cannot erase or corrupt remembered data. */
export function parseBaseSnapshot(raw: string | null): BaseSnapshot | null {
  try {
    if (!raw || raw.length > 16 * 1024 * 1024) return null
    const v: unknown = JSON.parse(raw)
    if (!record(v) || v.payloadVersion !== 1 || !text(v.worldUid) || !/^-?\d+$/.test(v.worldUid) || v.worldUid === '0'
      || !text(v.worldName) || !text(v.seedName) || !finite(v.updatedAt) || !finite(v.worldTimeTicks)
      || typeof v.truncated !== 'boolean' || !Array.isArray(v.pieces) || v.pieces.length > BASE_MEMORY_LIMIT
      || !Array.isArray(v.removed) || v.removed.length > BASE_MEMORY_LIMIT || !v.removed.every(text)) return null
    const ids = new Set<string>()
    for (const p of v.pieces) {
      if (!record(p) || !text(p.id) || !p.id || ['__proto__', 'constructor', 'prototype'].includes(p.id)
        || ids.has(p.id) || !text(p.prefabName) || !numericFields(p, ['x', 'z', 'yaw'])) return null
      ids.add(p.id)
      if (p.portal !== undefined) {
        const q = p.portal
        if (!record(q) || !common(q) || !finite(q.yaw) || !text(q.tag) || !text(q.author)
          || !(q.connectionType === null || finite(q.connectionType))
          || !(q.connectionHash === null || finite(q.connectionHash))
          || !(q.connectionKey == null || text(q.connectionKey))) return null
      }
      if (p.station !== undefined) {
        const s = p.station
        if (!record(s) || !common(s) || !numericFields(s, ['fuel', 'queued', 'level', 'productProgress',
          'processedOutputAmount', 'bakeTimer', 'startTimeTicks', 'lastTimeTicks'])
          || !text(s.content) || !text(s.processedOutputPrefab) || !strings(s.queueItems)
          || !numbers(s.slotStatuses) || !numbers(s.slotCookTimes)) return null
      }
      p.observedAt = v.updatedAt
      p.worldTimeTicks = v.worldTimeTicks
    }
    return v as unknown as BaseSnapshot
  } catch { return null }
}

export function mergeBaseSnapshot(previous: BaseMemory | undefined, snapshot: BaseSnapshot): BaseMemory {
  const sameWorld = previous?.worldUid === snapshot.worldUid
    && previous.worldName === snapshot.worldName && previous.seedName === snapshot.seedName
  if (sameWorld && previous.updatedAt >= snapshot.updatedAt) return previous
  const pieces = { ...(sameWorld ? previous.pieces : {}) }
  for (const id of snapshot.removed) delete pieces[id]
  for (const piece of snapshot.pieces) pieces[piece.id] = piece
  const all = Object.values(pieces).sort((a, b) => b.observedAt - a.observedAt)
  return { worldUid: snapshot.worldUid, worldName: snapshot.worldName, seedName: snapshot.seedName,
    updatedAt: snapshot.updatedAt, truncated: snapshot.truncated || all.length > BASE_MEMORY_LIMIT || Boolean(sameWorld && previous.truncated),
    pieces: Object.fromEntries(all.slice(0, BASE_MEMORY_LIMIT).map(piece => [piece.id, piece])) }
}

export function fallbackOperations(memory: BaseMemory): FallbackOperations {
  const pieces = Object.values(memory.pieces)
  return { updatedAt: memory.updatedAt, truncated: memory.truncated, baseOperations: {
    portals: pieces.flatMap(piece => piece.portal ? [piece.portal] : []),
    stations: pieces.flatMap(piece => piece.station ? [{ ...piece.station, observedWorldTimeTicks: piece.worldTimeTicks }] : []),
  } }
}

/** Reserve space for the app's other preferences in localStorage (UTF-16). */
export function boundBaseWorlds(worlds: Record<string, BaseMemory>): Record<string, BaseMemory> {
  let remaining = 1_500_000
  const result: Record<string, BaseMemory> = {}
  for (const world of Object.values(worlds).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4)) {
    remaining -= 2048
    if (remaining <= 0) break
    const pieces: Record<string, ObservedPiece> = {}
    let truncated = world.truncated
    for (const piece of Object.values(world.pieces).sort((a, b) => b.observedAt - a.observedAt)) {
      const cost = JSON.stringify([piece.id, piece]).length + 2
      if (cost > remaining) { truncated = true; continue }
      pieces[piece.id] = piece
      remaining -= cost
    }
    result[world.worldUid] = { ...world, pieces, truncated }
  }
  return result
}
