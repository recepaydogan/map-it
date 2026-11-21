import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from '../lib/analytics/analytics'
import { EVENTS } from '../lib/analytics/events'
import { installPathAnalyticsProperties } from '../lib/analytics/install-path.ts'
import {
  findValheimDirectory,
  findRunningTrackingProfile,
  installTrackingMod,
  installTrackingProfile,
  installLocationObserver,
  runningValheimProcessId,
  readPlayerPositionDetailed,
  type PlayerPosition,
} from '../lib/live-tracking/tracking-installer'
import { livePositionFeed } from '../lib/live-tracking/live-position-feed'
import { syncTrackingRestartNotice } from '../lib/live-tracking/tracking-restart-notice.ts'
import { useAppToastStore } from '../store/app-toast-store'
import { readPreferences, writePreferences } from '../store/preferences'
import { isOverwolf } from '../utils/overwolf'

export type TrackingStatus =
  /** Not running inside Overwolf; no file access. */
  | 'unsupported'
  | 'installing'
  /** Installed while the game runs; it loads on the next game start. */
  | 'restart-required'
  /** Installed, waiting for the game to write a position. */
  | 'waiting'
  | 'tracking'
  | 'error'

const POLL_INTERVAL_MS = 50
const STALE_AFTER_MS = 2_000
/**
 * How often the React-visible position may change. Every raw sample goes to
 * `livePositionFeed`; component state (which re-renders the window) only
 * needs to know roughly where the player is and which world they are in.
 */
const STATE_UPDATE_MS = 1_000
const VALHEIM_CLASS_ID = 21668

const isValheim = (info: overwolf.games.GameInfoUpdatedEvent['gameInfo'] | null | undefined) =>
  Boolean(info) && (info!.classId === VALHEIM_CLASS_ID || Math.floor((info!.id ?? 0) / 10) === VALHEIM_CLASS_ID)

/**
 * The tracker installs itself: no button, no dialog. The hook keeps the game
 * folder current with the payload shipped in this build, tells the player to
 * restart only when the game already had the old plugin loaded, and reads the
 * position file at a fixed cadence.
 */
/**
 * @param manageInstall Only the main window installs/repairs the mod; other
 * windows (the in-game overlay) just read the position file.
 */
export function useLivePosition(manageInstall = true) {
  const [status, setStatus] = useState<TrackingStatus>(isOverwolf() ? (manageInstall ? 'installing' : 'waiting') : 'unsupported')
  const [position, setPosition] = useState<PlayerPosition | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pushToast = useAppToastStore((state) => state.push)
  const clearToast = useAppToastStore((state) => state.clearKind)
  // Startup and game lifecycle events can arrive almost together. Queue every
  // request so file discovery/copy never runs concurrently and a later event is
  // never lost behind an earlier attempt that could not find Valheim yet.
  const installQueue = useRef<Promise<void>>(Promise.resolve())

  const ensureInstalled = useCallback((reason: 'startup' | 'game-start' | 'game-exit' | 'manual'): Promise<void> => {
    if (!isOverwolf() || !manageInstall) return Promise.resolve()
    const attempt = installQueue.current.then(async () => {
      setError(null)
      let targetDirectory: string | null = null
      try {
        const preferences = readPreferences()
        const target = await findValheimDirectory(preferences.trackingInstallDirectory)
        targetDirectory = target.directory
        if (preferences.trackingInstallDirectory !== target.directory) {
          writePreferences({ ...preferences, trackingInstallDirectory: target.directory })
          if (target.source !== 'saved') {
            track(EVENTS.TRACKER_DIRECTORY_DETECTED, {
              method: target.source,
              ...installPathAnalyticsProperties(target.directory),
            })
          }
        }
        const activeProfile = await findRunningTrackingProfile()
        const profileDirectory = activeProfile ?? preferences.trackingProfileDirectory
        if (activeProfile && activeProfile !== preferences.trackingProfileDirectory) {
          writePreferences({ ...readPreferences(), trackingProfileDirectory: activeProfile })
        }
        const outcome = await installTrackingMod(target.directory)
        const profileOutcome = profileDirectory
          ? await installTrackingProfile(profileDirectory, target.directory)
          : 'already-current'
        const observerOutcome = await installLocationObserver(target.directory, profileDirectory)
        console.info('[Position tracking] Tracker installation check completed', { reason, outcome, profileOutcome, observerOutcome, targetDirectory })
        clearToast('tracker-failed')
        const restartRequired = syncTrackingRestartNotice(
          [outcome, profileOutcome, observerOutcome], await runningValheimProcessId(),
        )
        if (!restartRequired) {
          setStatus((current) => (current === 'tracking' ? current : 'waiting'))
          return
        }
        // Copied (or blocked) while the game runs: the loaded plugin is the old one.
        setStatus('restart-required')
      } catch (failure) {
        const message = failure instanceof Error ? failure.message : 'unknown'
        console.error('[Position tracking] Tracker installation failed', {
          reason,
          error: message,
          targetDirectory,
        })
        setError(message)
        setStatus('error')
        // A missing install folder gets the locate modal (see
        // TrackerLocateModal) instead of a toast nobody can act on.
        if (message !== 'valheim-not-found') pushToast('tracker-failed', { detail: message })
      }
    })
    installQueue.current = attempt
    return attempt
  }, [clearToast, manageInstall, pushToast])

  // Check on app start and on both Valheim lifecycle edges. The start event is
  // especially important for custom Steam libraries: the running game's
  // execution path reveals a directory that could not be found at app startup.
  useEffect(() => {
    if (!isOverwolf() || !manageInstall) return
    const startup = window.setTimeout(() => void ensureInstalled('startup'), 0)
    const onGameInfoUpdated = (event: overwolf.games.GameInfoUpdatedEvent) => {
      if (!event.runningChanged || !isValheim(event.gameInfo)) return
      if (event.gameInfo?.isRunning) {
        // The process ID distinguishes a new launch from a duplicate start event.
        void ensureInstalled('game-start')
      } else {
        void ensureInstalled('game-exit')
      }
    }
    overwolf.games.onGameInfoUpdated.addListener(onGameInfoUpdated)
    return () => {
      window.clearTimeout(startup)
      overwolf.games.onGameInfoUpdated.removeListener(onGameInfoUpdated)
    }
  }, [clearToast, ensureInstalled, manageInstall])

  // Fixed-cadence reader: one read in flight at a time, scheduled from the
  // previous read's start so IO latency does not stretch the interval.
  useEffect(() => {
    if (!isOverwolf()) return
    let cancelled = false
    let inFlight = false
    let lastSeq = -1
    let lastUpdatedAt = -1
    let lastStateAt = -Infinity
    let lastStateWorld = ''
    const publishNull = () => {
      livePositionFeed.publish(null)
      lastStateAt = -Infinity
      lastStateWorld = ''
      setPosition(null)
    }
    const tick = async () => {
      if (inFlight) return
      const directory = readPreferences().trackingInstallDirectory
      if (!directory) return
      inFlight = true
      const read = await readPlayerPositionDetailed(directory)
      inFlight = false
      if (cancelled) return
      livePositionFeed.recordRead(read.outcome, read.durationMs)
      const next = read.position
      if (!next) {
        // A failed read is almost always the writer swapping the file in
        // (temp + replace) or a half-written payload. Keep the last position;
        // only staleness measured from the last GOOD sample drops it.
        if (lastUpdatedAt >= 0 && Date.now() - lastUpdatedAt >= STALE_AFTER_MS) {
          lastUpdatedAt = -1
          lastSeq = -1
          publishNull()
          setStatus((current) => (current === 'tracking' ? 'waiting' : current))
        }
        return
      }
      if (Date.now() - next.updatedAt >= STALE_AFTER_MS) {
        if (lastUpdatedAt !== -1 || lastSeq !== -1) {
          lastUpdatedAt = -1
          lastSeq = -1
          publishNull()
          setStatus((current) => (current === 'tracking' ? 'waiting' : current))
        }
        return
      }
      const seq = next.seq ?? -1
      if (seq >= 0 ? seq === lastSeq : next.updatedAt === lastUpdatedAt) return
      lastSeq = seq
      lastUpdatedAt = next.updatedAt
      livePositionFeed.publish(next)
      // Component state: first sample, a world change, or once a second.
      const world = `${next.worldName ?? ''}|${next.seedName ?? ''}`
      const now = performance.now()
      if (world !== lastStateWorld || now - lastStateAt >= STATE_UPDATE_MS) {
        lastStateAt = now
        lastStateWorld = world
        setPosition(next)
      }
      setStatus((current) => current === 'restart-required' ? current : 'tracking')
    }
    const timer = window.setInterval(() => void tick(), POLL_INTERVAL_MS)
    void tick()
    return () => { cancelled = true; window.clearInterval(timer); livePositionFeed.publish(null) }
  }, [])

  /** Re-run discovery + install now — the locate modal calls this after the
   *  player points us at the game folder. */
  const retryInstall = useCallback(() => ensureInstalled('manual'), [ensureInstalled])

  return { status, position, error, retryInstall }
}
