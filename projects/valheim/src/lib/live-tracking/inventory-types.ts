/**
 * Contract between the tracking mod and the app. The mod writes prefab
 * identities and counts only; every name, icon, and description is resolved
 * from the app's own extracted database.
 */
export const INVENTORY_PAYLOAD_VERSION = 1

/** The mod heartbeats every 15s, so anything older than this is stale. */
export const INVENTORY_FRESHNESS_MS = 45_000

/**
 * How long the app waits for a first inventory file while position tracking is
 * already live. Longer than that means the installed mod predates inventory
 * support and has to be updated.
 */
export const INVENTORY_MOD_GRACE_MS = 15_000

export interface LiveInventoryItem {
  prefab: string
  amount: number
  quality: number
  equipped: boolean
}

export interface LiveInventorySnapshot {
  payloadVersion: number
  sharing: boolean
  updatedAt: number
  worldName: string
  worldUid: string
  seedName: string
  characterId: string
  characterName: string
  items: LiveInventoryItem[]
}

export type InventoryStatus =
  /** The player has not turned on inventory sharing. */
  | 'disabled'
  /** File access needs the Overwolf host; the browser preview cannot read it. */
  | 'unsupported-host'
  /** Position tracking has not been installed yet, so there is no mod to read. */
  | 'tracker-missing'
  /** Consent is on but the installed mod never writes inventory snapshots. */
  | 'mod-update-required'
  /** The mod reports that sharing is switched off on the game side. */
  | 'sharing-off'
  /** Installed and consented, waiting for a character to load. */
  | 'waiting'
  /** A newer mod wrote a payload this app version does not understand. */
  | 'unsupported-payload'
  /** The file exists but could not be parsed or failed validation. */
  | 'invalid'
  /** The last snapshot is older than the freshness window. */
  | 'stale'
  | 'live'

export const INVENTORY_STATUSES_WITH_DATA: readonly InventoryStatus[] = ['live', 'stale']

/** Only a live snapshot may be treated as the player's current inventory. */
export const isAuthoritativeInventory = (status: InventoryStatus) => status === 'live'
