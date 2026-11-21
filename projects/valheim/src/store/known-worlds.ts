import { parseKnownWorlds, type WorldIdentity } from '../lib/valheim/known-worlds.ts'

const STORAGE_KEY = 'valheim-companion:known-worlds'

export function readKnownWorlds(): WorldIdentity[] {
  try { return parseKnownWorlds(window.localStorage.getItem(STORAGE_KEY)) } catch { return [] }
}

export function writeKnownWorlds(worlds: WorldIdentity[]): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(worlds)) }
  catch (error) { console.error('[Worlds] Could not remember world seeds', error) }
}

