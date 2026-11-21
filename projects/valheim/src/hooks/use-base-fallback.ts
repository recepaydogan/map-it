import { useEffect, useMemo, useRef, useState } from 'react'
import { BASE_FRESHNESS_MS, fallbackOperations } from '../lib/live-tracking/base-fallback.ts'
import { readBaseSnapshot, writeBaseRequest } from '../lib/live-tracking/base-fallback-reader.ts'
import { useBaseMemoryStore } from '../store/base-memory-store.ts'
import { PREFERENCES_CHANGED_EVENT, readPreferences } from '../store/preferences'
import { isOverwolf } from '../utils/overwolf'
import { saveDiagnostic } from '../lib/valheim/save-diagnostics.ts'
import type { SavedStructureCluster } from '../types/world-save.ts'

interface Geometry { worldUid: string; structures: SavedStructureCluster[]; structurePaths: string[] }
export function useBaseFallback(
  enabled: boolean,
  selected: { name: string; seedName: string } | null,
  selectedUid: string | null,
  live: boolean,
) {
  const [directory, setDirectory] = useState(() => readPreferences().trackingInstallDirectory)
  const worlds = useBaseMemoryStore(state => state.worlds)
  const apply = useBaseMemoryStore(state => state.apply)
  const [geometry, setGeometry] = useState<Geometry | null>(null)
  const geometryWorker = useRef<Worker | null>(null)
  useEffect(() => {
    const sync = () => setDirectory(readPreferences().trackingInstallDirectory)
    window.addEventListener(PREFERENCES_CHANGED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(PREFERENCES_CHANGED_EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])
  const name = selected?.name
  const seed = selected?.seedName
  const memory = useMemo(() => {
    if (!enabled || !name || !seed) return null
    const matches = Object.values(worlds).filter(world => world.worldName === name && world.seedName === seed
      && (!selectedUid || world.worldUid === selectedUid))
    return matches.length === 1 ? matches[0] : null
  }, [enabled, name, seed, worlds, selectedUid])

  useEffect(() => {
    if (!isOverwolf() || !directory || !enabled || !live || !selectedUid || !name || !seed) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // Serialize writes including cleanup: an in-flight renewal cannot re-enable
    // sampling after a save becomes available or the selected world changes.
    let writing: Promise<void> = Promise.resolve()
    const loop = async () => {
      try {
        writing = writeBaseRequest(directory, selectedUid, Date.now() + 15_000)
        await writing
        if (cancelled) return
        const snapshot = await readBaseSnapshot(directory)
        if (cancelled) return
        if (snapshot && snapshot.worldUid === selectedUid && snapshot.worldName === name && snapshot.seedName === seed
          && Date.now() - snapshot.updatedAt <= BASE_FRESHNESS_MS && snapshot.updatedAt <= Date.now() + 5000) {
          apply(snapshot)
          saveDiagnostic('base-fallback.snapshot', { worldUid: selectedUid, pieces: snapshot.pieces.length, truncated: snapshot.truncated })
        } else saveDiagnostic('base-fallback.waiting', { worldUid: selectedUid, reason: snapshot ? 'stale-or-different-world' : 'missing-or-invalid-payload' })
      } catch (error) { saveDiagnostic('base-fallback.read-failed', { path: directory }, error) }
      finally { if (!cancelled) timer = setTimeout(() => void loop(), 5000) }
    }
    void loop()
    return () => {
      cancelled = true
      clearTimeout(timer)
      void writing.catch(() => undefined).then(() => writeBaseRequest(directory, '', 0))
        .catch(error => saveDiagnostic('base-fallback.stop-failed', { path: directory }, error))
    }
  }, [apply, directory, enabled, live, selectedUid, name, seed])

  useEffect(() => {
    if (!enabled) return
    const worker = new Worker(new URL('../workers/base-fallback.worker.ts', import.meta.url), { type: 'module' })
    geometryWorker.current = worker
    worker.onmessage = (event: MessageEvent<Geometry>) => setGeometry(event.data)
    worker.onerror = event => saveDiagnostic('base-fallback.geometry-failed', {}, event.message)
    return () => { worker.terminate(); geometryWorker.current = null }
  }, [enabled])
  useEffect(() => {
    if (memory) geometryWorker.current?.postMessage(memory)
  }, [memory])

  const operations = useMemo(() => memory ? fallbackOperations(memory) : null, [memory])
  return { operations, geometry: memory && geometry?.worldUid === memory.worldUid ? geometry : null }
}
