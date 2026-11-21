import { isOverwolf } from '../../utils/overwolf'
import { saveDiagnostic } from '../valheim/save-diagnostics.ts'
import { parseInventoryPayload, type InventoryReadResult } from './inventory-payload.ts'
import { INVENTORY_PAYLOAD_VERSION } from './inventory-types.ts'
import { parseContainersPayload, type ContainersReadResult } from './container-payload.ts'
import { CONTAINERS_PAYLOAD_VERSION } from './container-types.ts'
import { parseNearbyCreaturesPayload, type NearbyCreaturesReadResult } from './creature-payload.ts'
import { NEARBY_CREATURES_PAYLOAD_VERSION } from './creature-types.ts'

const PLUGIN_SUBDIRECTORY = 'BepInEx\\plugins\\ValheimCompanion'

export const inventoryFilePath = (directory: string) =>
  `${directory}\\${PLUGIN_SUBDIRECTORY}\\player-inventory.json`

export const inventoryConsentFilePath = (directory: string) =>
  `${directory}\\${PLUGIN_SUBDIRECTORY}\\inventory-sharing.txt`

export const containersFilePath = (directory: string) =>
  `${directory}\\${PLUGIN_SUBDIRECTORY}\\player-containers.json`

export const nearbyCreaturesFilePath = (directory: string) =>
  `${directory}\\${PLUGIN_SUBDIRECTORY}\\nearby-creatures.json`

const readText = (path: string) => new Promise<string | null>((resolve) => {
  overwolf.io.readFileContents(path, 'UTF8' as overwolf.io.enums.eEncoding, (result) => {
    if (!result.success) saveDiagnostic('tracking.read-failed', { path }, result.error ?? 'text read failed')
    resolve(result.success && typeof result.content === 'string' ? result.content : null)
  })
})

const writeText = (path: string, contents: string) => new Promise<void>((resolve, reject) => {
  overwolf.io.writeFileContents(
    path,
    contents,
    'UTF8' as overwolf.io.enums.eEncoding,
    true,
    (result) => result.success ? resolve() : reject(new Error(result.error ?? 'write-failed')),
  )
})

/** Reads the snapshot the tracking mod writes next to its own plugin folder. */
export async function readInventorySnapshot(directory: string): Promise<InventoryReadResult> {
  if (!isOverwolf()) return { kind: 'missing' }
  return parseInventoryPayload(await readText(inventoryFilePath(directory)))
}

/** Reads the container snapshot the mod writes under the same consent. */
export async function readContainersSnapshot(directory: string): Promise<ContainersReadResult> {
  if (!isOverwolf()) return { kind: 'missing' }
  return parseContainersPayload(await readText(containersFilePath(directory)))
}

/** Reads nearby loaded creatures reported independently of inventory sharing. */
export async function readNearbyCreaturesSnapshot(directory: string): Promise<NearbyCreaturesReadResult> {
  if (!isOverwolf()) return { kind: 'missing' }
  return parseNearbyCreaturesPayload(await readText(nearbyCreaturesFilePath(directory)))
}

/**
 * Consent lives in a file the mod reads every couple of seconds, so revoking it
 * stops the game from writing inventory data at all instead of only stopping the
 * app from reading it.
 */
export async function setInventorySharing(directory: string, enabled: boolean): Promise<void> {
  if (!isOverwolf()) throw new Error('overwolf-required')
  await writeText(inventoryConsentFilePath(directory), enabled ? 'on' : 'off')
  if (enabled) {
    await ensureInventoryFile(directory)
    await ensureContainersFile(directory)
  }
}

/** Same rationale as {@link ensureInventoryFile}, for the container snapshot. */
export async function ensureContainersFile(directory: string): Promise<void> {
  if (!isOverwolf()) return
  const path = containersFilePath(directory)
  const existing = await readText(path)
  if (existing !== null && existing.trim().length > 0) return
  await writeText(path, JSON.stringify({
    payloadVersion: CONTAINERS_PAYLOAD_VERSION,
    sharing: false,
    updatedAt: 0,
    containers: [],
    removed: [],
  }))
}

export async function ensureNearbyCreaturesFile(directory: string): Promise<void> {
  if (!isOverwolf()) return
  const path = nearbyCreaturesFilePath(directory)
  const existing = await readText(path)
  if (existing !== null && existing.trim().length > 0) return
  await writeText(path, JSON.stringify({
    payloadVersion: NEARBY_CREATURES_PAYLOAD_VERSION,
    updatedAt: 0,
    worldName: '',
    worldUid: '',
    seedName: '',
    radius: 200,
    creatures: [],
  }))
}

/**
 * The plugin folder lives under Program Files, where the game process can
 * write to files that already exist but may not be allowed to create new ones.
 * The app runs with the permissions that installed the mod, so it creates the
 * snapshot file up front and the mod only ever overwrites it.
 */
export async function ensureInventoryFile(directory: string): Promise<void> {
  if (!isOverwolf()) return
  const path = inventoryFilePath(directory)
  const existing = await readText(path)
  if (existing !== null && existing.trim().length > 0) return
  await writeText(path, JSON.stringify({
    payloadVersion: INVENTORY_PAYLOAD_VERSION,
    sharing: false,
    updatedAt: 0,
    items: [],
  }))
}

export { parseInventoryPayload, snapshotToStock } from './inventory-payload.ts'
export type { InventoryReadResult, InventorySourceSelection } from './inventory-payload.ts'
