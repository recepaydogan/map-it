/**
 * Reports whether the tracking mod produced a usable player position during a
 * Valheim game session. Coordinates, world names, seeds, and paths stay local.
 */
import { track } from '../analytics/analytics'
import { EVENTS } from '../analytics/events'
import { readPreferences } from '../../store/preferences'
import {
  findValheimDirectory,
  readPlayerPositionDetailed,
  type PositionRead,
} from './tracking-installer'

const FIRST_FIX_GRACE_MS = 120_000
const POSITION_CHECK_INTERVAL_MS = 1_000
const STALE_AFTER_MS = 2_000

type MissingReason =
  | 'game_directory_not_found'
  | 'directory_resolution_failed'
  | 'position_file_unreadable'
  | 'tracker_not_writing'
  | 'position_payload_torn'
  | 'position_payload_invalid'
  | 'position_stale'
  | 'position_unavailable'

type PositionReadOutcome = PositionRead['outcome']

const reasonForRead = (read: PositionRead): MissingReason => {
  if (read.position) return 'position_stale'
  if (read.outcome === 'io-error') return 'position_file_unreadable'
  if (read.outcome === 'empty') return 'tracker_not_writing'
  if (read.outcome === 'torn') return 'position_payload_torn'
  if (read.outcome === 'invalid') return 'position_payload_invalid'
  return 'position_unavailable'
}

export const startLivePositionAnalytics = (onFirstPosition?: () => void): (() => void) => {
  const startedAt = Date.now()
  let directory: string | null = null
  let connected = false
  let reportedMissing = false
  let stopped = false
  let reading = false
  let lastReason: MissingReason = 'position_unavailable'
  let lastReadOutcome: PositionReadOutcome | null = null
  let positionTimer: number | null = null

  const poll = async (): Promise<void> => {
    if (stopped || connected || reading) return
    reading = true
    try {
      if (!directory) {
        const savedDirectory = readPreferences().trackingInstallDirectory
        directory = (await findValheimDirectory(savedDirectory)).directory
        if (stopped) return
      }

      const read = await readPlayerPositionDetailed(directory)
      if (stopped) return
      lastReadOutcome = read.outcome
      const sample = read.position
      const sampleAgeMs = sample ? Date.now() - sample.updatedAt : Number.POSITIVE_INFINITY
      if (!sample || sampleAgeMs >= STALE_AFTER_MS) {
        lastReason = reasonForRead(read)
        return
      }

      connected = true
      onFirstPosition?.()
      window.clearTimeout(missingTimer)
      if (positionTimer !== null) window.clearInterval(positionTimer)
      track(EVENTS.LIVE_POSITION_CONNECTED, {
        wait_seconds: Math.round((Date.now() - startedAt) / 1_000),
        after_missing: reportedMissing,
        sample_age_seconds: Math.max(0, Math.round(sampleAgeMs / 1_000)),
        read_outcome: read.outcome,
      })
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : typeof error === 'object' && error && 'message' in error
          ? String(error.message)
          : 'unknown'
      lastReason = message === 'valheim-not-found'
        ? 'game_directory_not_found'
        : 'directory_resolution_failed'
      directory = null
    } finally {
      reading = false
    }
  }

  const missingTimer = window.setTimeout(() => {
    if (stopped || connected) return
    reportedMissing = true
    track(EVENTS.LIVE_POSITION_MISSING, {
      waited_seconds: Math.round(FIRST_FIX_GRACE_MS / 1_000),
      reason: lastReason,
      last_read_outcome: lastReadOutcome,
      install_directory_known: directory !== null,
    })
  }, FIRST_FIX_GRACE_MS)

  void poll()
  positionTimer = window.setInterval(() => void poll(), POSITION_CHECK_INTERVAL_MS)

  return () => {
    stopped = true
    window.clearTimeout(missingTimer)
    if (positionTimer !== null) window.clearInterval(positionTimer)
  }
}
