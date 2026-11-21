import { useEffect, useMemo, useState } from 'react'
import { parseClientLocations, type ClientLocationsSnapshot } from '../lib/live-tracking/client-locations.ts'
import { useClientLocationStore } from '../store/client-location-store.ts'
import { PREFERENCES_CHANGED_EVENT, readPreferences } from '../store/preferences.ts'
import { isOverwolf } from '../utils/overwolf.ts'

interface SelectedWorld { uid: string; name: string; seedName: string }
export function useClientLocations(selected: SelectedWorld | null, tracked: { worldName?: string; seedName?: string } | null, enabled = true) {
  const [directory, setDirectory] = useState(() => readPreferences().trackingInstallDirectory)
  const [snapshot, setSnapshot] = useState<ClientLocationsSnapshot | null>(null)
  const worlds = useClientLocationStore(state => state.worlds)
  const apply = useClientLocationStore(state => state.apply)
  useEffect(() => {
    const sync = () => setDirectory(readPreferences().trackingInstallDirectory)
    window.addEventListener(PREFERENCES_CHANGED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(PREFERENCES_CHANGED_EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])
  useEffect(() => {
    if (!enabled || !directory || !isOverwolf()) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      const raw = await new Promise<string | null>(resolve => overwolf.io.readFileContents(
        `${directory}\\BepInEx\\plugins\\ValheimCompanion\\client-locations.json`, 'UTF8' as overwolf.io.enums.eEncoding,
        result => resolve(result.success && typeof result.content === 'string' ? result.content : null)))
      if (stopped) return
      const parsed = parseClientLocations(raw)
      if (parsed && Date.now() - parsed.updatedAt <= 15_000 && parsed.updatedAt <= Date.now() + 5000) {
        apply(parsed)
        setSnapshot(parsed)
      } else setSnapshot(null)
      timer = setTimeout(() => void tick(), 5000)
    }
    void tick()
    return () => { stopped = true; clearTimeout(timer) }
  }, [apply, directory, enabled])
  const name = selected?.name
  const seed = selected?.seedName
  const uid = selected?.uid
  const matches = useMemo(() => Object.values(worlds).filter(world => world.worldName === name && world.seedName === seed
    && (!uid || world.worldUid === uid)), [worlds, name, seed, uid])
  const live = enabled && snapshot
    && snapshot.worldName === name && snapshot.seedName === seed && (!uid || snapshot.worldUid === uid)
    && tracked?.worldName === name && tracked.seedName === seed ? snapshot : null
  const memory = live ? worlds[live.worldUid] ?? null : matches.length === 1 ? matches[0] : null
  const world = live ?? memory
  const observations = useMemo(() => memory ? Object.values(memory.locations) : [], [memory])
  return { world, observations, snapshot: live }
}
