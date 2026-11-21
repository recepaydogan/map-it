import { revealWindow } from '../../overwolf-utils/window-manager'
import { isOverwolf } from '../../utils/overwolf'

export const CHEST_MAP_REQUEST_KEY = 'valheim-companion:chest-map-request'
export interface ChestMapRequest {
  createdAt: number
  worldUid: string
  seedName: string
  containerId: string
  prefab: string
  x: number
  z: number
  label: string
}
export function readChestMapRequest(): ChestMapRequest | null {
  try {
    const value = JSON.parse(localStorage.getItem(CHEST_MAP_REQUEST_KEY) ?? 'null')
    if (!value || !Number.isFinite(value.createdAt) || Math.abs(Date.now() - value.createdAt) > 30_000 || !Number.isFinite(value.x) || !Number.isFinite(value.z)) return null
    if (!['worldUid', 'seedName', 'containerId', 'prefab', 'label'].every((key) => typeof value[key] === 'string')) return null
    return value as ChestMapRequest
  } catch { return null }
}
export async function showChestOnMap(request: Omit<ChestMapRequest, 'createdAt'>) {
  localStorage.setItem(CHEST_MAP_REQUEST_KEY, JSON.stringify({ ...request, createdAt: Date.now() }))
  window.dispatchEvent(new Event(CHEST_MAP_REQUEST_KEY))
  if (isOverwolf()) await revealWindow('main')
  else if (new URLSearchParams(window.location.search).get('window')) window.open('/', 'valheim_map')
}
