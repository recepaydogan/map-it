import { useEffect, useState } from 'react'
import { matchingLocalExploration, parseLocalExploration, type ExplorationIdentity, type LocalExplorationSnapshot } from '../lib/live-tracking/local-exploration.ts'
import { installLocalExploration } from '../lib/live-tracking/tracking-installer.ts'
import { PREFERENCES_CHANGED_EVENT, readPreferences } from '../store/preferences.ts'
import { isOverwolf } from '../utils/overwolf.ts'

/** Separate IO path: remote sessions never enable this hook. */
export function useLocalExploration(enabled: boolean, identity: ExplorationIdentity | null, installEnabled = true) {
  const [preferences, setPreferences] = useState(readPreferences)
  const [snapshot, setSnapshot] = useState<LocalExplorationSnapshot | null>(null)
  const [installation, setInstallation] = useState<{ directory: string; restart: boolean } | null>(null)
  const directory = preferences.trackingInstallDirectory
  const profile = preferences.trackingProfileDirectory
  // Spoiler filtering owns this read-only feed. Hiding the player-position
  // marker must not freeze personal discoveries at the last character save.
  const active = enabled
  const context = JSON.stringify([directory, identity])
  useEffect(() => {
    const sync = () => setPreferences(readPreferences())
    window.addEventListener(PREFERENCES_CHANGED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(PREFERENCES_CHANGED_EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])
  useEffect(() => {
    if (!active || !installEnabled || !directory || !isOverwolf()) return
    let stopped = false
    void installLocalExploration(directory, profile).then(outcome => {
      if (!stopped) setInstallation({ directory, restart: outcome === 'installed-restart-required' || outcome === 'locked-restart-required' })
    }).catch((error: unknown) => console.warn('[Local exploration] Could not install the local helper', error))
    return () => { stopped = true }
  }, [active, installEnabled, directory, profile])
  const [loadedContext, setLoadedContext] = useState<string | null>(null)
  useEffect(() => {
    if (!active || !directory || !isOverwolf()) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      try {
        const raw = await new Promise<string | null>(resolve => {
          const timeout = setTimeout(() => resolve(null), 1500)
          try {
            overwolf.io.readFileContents(
              `${directory}\\BepInEx\\plugins\\ValheimCompanion\\local-exploration.json`, 'UTF8' as overwolf.io.enums.eEncoding,
              result => { clearTimeout(timeout); resolve(result.success && typeof result.content === 'string' ? result.content : null) })
          } catch { clearTimeout(timeout); resolve(null) }
        })
        const parsed = await parseLocalExploration(raw)
        if (stopped) return
        setLoadedContext(context)
        setSnapshot(previous => {
          if (!parsed) return null
          // Heartbeats must not regenerate a large mask or refilter all nodes.
          if (previous?.worldUid === parsed.worldUid && previous.characterId === parsed.characterId
            && previous.exploration.textureSize === parsed.exploration.textureSize && previous.exploration.pixelSize === parsed.exploration.pixelSize
            && previous.exploration.bits.length === parsed.exploration.bits.length
            && previous.exploration.bits.every((byte, index) => byte === parsed.exploration.bits[index])) {
            return { ...parsed, exploration: previous.exploration }
          }
          return parsed
        })
      } catch { if (!stopped) setSnapshot(null) }
      if (!stopped) timer = setTimeout(() => void tick(), 1000)
    }
    void tick()
    return () => { stopped = true; clearTimeout(timer) }
  }, [active, directory, context])
  const exploration = active && loadedContext === context ? matchingLocalExploration(snapshot, identity) : null
  return { exploration, characterId: exploration ? snapshot?.characterId ?? null : null,
    live: exploration !== null, restartRequired: active && !exploration && installation?.directory === directory && installation.restart }
}
