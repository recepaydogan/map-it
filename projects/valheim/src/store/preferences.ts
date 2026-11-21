export type InventorySourcePreferences = {
  characterInventory: boolean
  equippedItems: boolean
  /** Contents of chests the player placed themselves. */
  ownContainers: boolean
  /** Contents of chests placed by other players (co-op bases). */
  friendContainers: boolean
}

export type AppLanguage = 'en' | 'ru' | 'zh-Hans' | 'pt-BR'

export type AppPreferences = {
  language: AppLanguage
  overlayEnabled: boolean
  autoShowOverlay: boolean
  autoOpenInGameApp: boolean
  autoLaunchCompanion: boolean
  worldSeed: string
  worldSaveId: string | null
  /** Seed-only worlds can use the placement rules from earlier game versions. */
  locationGenerationProfiles: Record<string, 'current' | 'legacy'>
  observedLocationsNoticeDismissed: boolean
  positionTrackingEnabled: boolean
  trackingInstallDirectory: string | null
  /** Optional BepInEx profile root used by Thunderstore or r2modman. */
  trackingProfileDirectory: string | null
  /** Revocable setting for reading the character inventory and tracked chests. */
  inventoryTrackingEnabled: boolean
  inventorySources: InventorySourcePreferences
}

const STORAGE_KEY = 'valheim-companion:preferences'

export const DEFAULT_PREFERENCES: AppPreferences = {
  language: 'en',
  overlayEnabled: true,
  autoShowOverlay: true,
  autoOpenInGameApp: true,
  autoLaunchCompanion: true,
  worldSeed: 'Valheim',
  worldSaveId: null,
  locationGenerationProfiles: {},
  observedLocationsNoticeDismissed: false,
  positionTrackingEnabled: false,
  trackingInstallDirectory: null,
  trackingProfileDirectory: null,
  inventoryTrackingEnabled: true,
  inventorySources: {
    characterInventory: true,
    equippedItems: true,
    ownContainers: true,
    friendContainers: true,
  },
}

export const readPreferences = (): AppPreferences => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFERENCES
    const stored = JSON.parse(raw) as Partial<AppPreferences>
    return {
      ...DEFAULT_PREFERENCES,
      ...stored,
      language: stored.language === 'ru' || stored.language === 'zh-Hans' || stored.language === 'pt-BR' ? stored.language : 'en',
      locationGenerationProfiles: stored.locationGenerationProfiles ?? {},
      inventorySources: {
        ...DEFAULT_PREFERENCES.inventorySources,
        ...(stored.inventorySources ?? {}),
        friendContainers: true,
      },
    }
  } catch (error) {
    console.error('[Preferences] Failed to read preferences', error)
    return DEFAULT_PREFERENCES
  }
}

/** Fired in this window after a write; `storage` only reaches other windows. */
export const PREFERENCES_CHANGED_EVENT = 'valheim-companion:preferences-changed'

export const writePreferences = (preferences: AppPreferences): void => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT))
}

export const clearPreferences = (): void => {
  window.localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT))
}
