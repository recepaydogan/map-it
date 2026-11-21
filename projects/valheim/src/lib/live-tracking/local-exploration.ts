import type { ExploredMap } from '../valheim/explored-map.ts'

export interface LocalExplorationSnapshot {
  worldUid: string
  worldName: string
  seedName: string
  characterId: string
  characterName: string
  updatedAt: number
  exploration: ExploredMap
}

export const LOCAL_EXPLORATION_MAX_AGE = 10_000

/** Bounded inflation; malformed, shared, remote and stale records reveal nothing. */
export async function parseLocalExploration(raw: string | null, now = Date.now()): Promise<LocalExplorationSnapshot | null> {
  if (!raw || raw.length > 3_000_000) return null
  try {
    const value = JSON.parse(raw)
    if (value.payloadVersion !== 1 || value.isLocal !== true
      || !Number.isFinite(value.updatedAt) || now - value.updatedAt > LOCAL_EXPLORATION_MAX_AGE || value.updatedAt > now + 5_000
      || !Number.isInteger(value.textureSize) || value.textureSize <= 0 || value.textureSize > 4096
      || !Number.isFinite(value.pixelSize) || value.pixelSize <= 0 || value.pixelSize > 128
      || !['worldUid', 'worldName', 'seedName', 'characterId', 'characterName'].every(key => typeof value[key] === 'string' && value[key].length > 0 && value[key].length < 256)
      || !/^-?\d+$/.test(value.worldUid) || !/^-?\d+$/.test(value.characterId)
      || typeof value.personalGzip !== 'string') return null
    const compressed = Uint8Array.from(atob(value.personalGzip), char => char.charCodeAt(0))
    const expected = Math.ceil(value.textureSize ** 2 / 8)
    const reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader()
    const bits = new Uint8Array(expected)
    let offset = 0
    try {
      for (;;) {
        const { value: chunk, done } = await reader.read()
        if (done) break
        if (offset + chunk.length > expected) { await reader.cancel(); return null }
        bits.set(chunk, offset)
        offset += chunk.length
      }
    } finally { reader.releaseLock() }
    if (offset !== expected) return null
    return {
      worldUid: value.worldUid, worldName: value.worldName, seedName: value.seedName,
      characterId: value.characterId, characterName: value.characterName, updatedAt: value.updatedAt,
      exploration: { textureSize: value.textureSize, pixelSize: value.pixelSize, bits },
    }
  } catch { return null }
}

export interface ExplorationIdentity {
  uid: string
  name: string
  seedName: string
  characterName: string | null
  characterId: string | null
  manualCharacter: boolean
}

export function matchingLocalExploration(snapshot: LocalExplorationSnapshot | null, identity: ExplorationIdentity | null, now = Date.now()): ExploredMap | null {
  if (!snapshot || !identity || now - snapshot.updatedAt > LOCAL_EXPLORATION_MAX_AGE
    || snapshot.worldUid !== identity.uid || snapshot.worldName !== identity.name || snapshot.seedName !== identity.seedName
    || (identity.characterName && snapshot.characterName.toLowerCase() !== identity.characterName.toLowerCase())
    || (identity.characterId && snapshot.characterId !== identity.characterId)
    || (identity.manualCharacter && !identity.characterId)) return null
  return snapshot.exploration
}
