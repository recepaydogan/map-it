import { FolderSearch } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOnboarding } from '../features/onboarding/use-onboarding'
import { EVENTS } from '../lib/analytics/events'
import { track } from '../lib/analytics/analytics'
import { installPathAnalyticsProperties } from '../lib/analytics/install-path.ts'
import { findSelectedValheimDirectory } from '../lib/live-tracking/tracking-installer'
import { readPreferences, writePreferences } from '../store/preferences'
import { isOverwolf } from '../utils/overwolf'

/** Permanent opt-out of the locate modal — "I don't want live position
 *  tracking". Discovery keeps running in the background, so a later game
 *  launch still repairs the install silently. */
const DISMISSED_KEY = 'valheim-companion:tracker-locate-dismissed'

/** How long the tracker must stay unlocatable before the modal interrupts.
 *  Long enough that a first launch gets its bearings (and the onboarding
 *  tour, which gates this timer entirely, is never talked over). */
const LOCATE_MODAL_DELAY_MS = 12_000

const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

const openFolderPicker = (initialPath: string): Promise<string | null> => {
  if (!isOverwolf() || !overwolf.utils?.openFolderPicker) return Promise.resolve(null)
  return new Promise((resolve) => {
    overwolf.utils.openFolderPicker(initialPath, (result) => {
      resolve(result.success && result.path ? result.path : null)
    })
  })
}

interface TrackerLocateModalProps {
  /** True while install discovery is stuck on valheim-not-found. */
  visible: boolean
  /** Re-runs discovery + install against the freshly saved directory. */
  onLocated: () => Promise<void>
  /** Explicit Settings action bypasses the automatic prompt's delay and opt-out. */
  manual?: boolean
  onDismiss?: () => void
}

/**
 * Automatic discovery has run dry: Valheim is in neither default Steam path
 * and no running game has revealed its folder. Live tracking simply does not
 * work until the player either points us at the install or opts out — so
 * this asks, once the onboarding tour is done and the app has had a moment.
 */
export function TrackerLocateModal({ visible, onLocated, manual = false, onDismiss }: TrackerLocateModalProps) {
  const { t } = useTranslation()
  const onboardingActive = useOnboarding((state) => state.active)
  const [dismissed, setDismissed] = useState(readDismissed)
  const [selectionInvalid, setSelectionInvalid] = useState(false)
  const [picking, setPicking] = useState(false)
  const [ready, setReady] = useState(false)

  const armed = visible && (manual || (!onboardingActive && !dismissed))
  // Disarming resets the countdown's result, so re-arming (the tour replayed,
  // or a repeat failure) always waits the full delay again. Render-time reset
  // instead of an effect: the stale `ready` must never paint.
  const [prevArmed, setPrevArmed] = useState(armed)
  if (prevArmed !== armed) {
    setPrevArmed(armed)
    if (!armed) setReady(false)
  }

  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setReady(true), LOCATE_MODAL_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [armed])

  if (!armed || (!manual && !ready)) return null

  const dismissForever = () => {
    if (manual) {
      onDismiss?.()
      return
    }
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch { /* storage unavailable — session-only dismissal still applies */ }
    setDismissed(true)
    track(EVENTS.TRACKER_FOLDER_PICKER_COMPLETED, { result: 'opted_out' })
  }

  const findFolder = async () => {
    if (picking) return
    setPicking(true)
    try {
      track(EVENTS.TRACKER_FOLDER_PICKER_OPENED)
      const initialPath = readPreferences().trackingInstallDirectory
        ?? 'C:\\Program Files (x86)\\Steam\\steamapps\\common'
      const selectedPath = await openFolderPicker(initialPath)
      if (!selectedPath) {
        track(EVENTS.TRACKER_FOLDER_PICKER_COMPLETED, { result: 'cancelled' })
        return
      }
      const directory = await findSelectedValheimDirectory(selectedPath)
      if (!directory) {
        setSelectionInvalid(true)
        track(EVENTS.TRACKER_FOLDER_PICKER_COMPLETED, { result: 'invalid' })
        return
      }
      const preferences = readPreferences()
      writePreferences({ ...preferences, trackingInstallDirectory: directory })
      setSelectionInvalid(false)
      track(EVENTS.TRACKER_FOLDER_PICKER_COMPLETED, { result: 'selected' })
      track(EVENTS.TRACKER_FOLDER_MANUALLY_SELECTED, installPathAnalyticsProperties(directory))
      // A successful install flips the tracking status, which drops `visible`
      // and unmounts this modal — no local success state needed.
      await onLocated()
    } finally {
      setPicking(false)
    }
  }

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tracker-locate-title"
        className="w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-400/15">
            <FolderSearch size={18} className="text-amber-300" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="tracker-locate-title" className="text-sm font-semibold text-[var(--text)]">
              {t('tracking.locate.title')}
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
              {t('tracking.locate.body')}
            </p>
          </div>
        </div>
        {selectionInvalid && (
          <p role="alert" className="mt-3 rounded-[var(--radius-md)] border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-[var(--text)]">
            {t('tracking.locate.invalid')}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void findFolder()}
            disabled={picking}
            className="h-9 cursor-pointer rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 text-xs font-semibold text-[var(--text)] transition-[background-color,opacity] hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-60"
          >
            {t('tracking.locate.find')}
          </button>
          <button
            type="button"
            onClick={dismissForever}
            disabled={picking}
            className="h-9 cursor-pointer rounded-[var(--radius-md)] px-3 text-xs font-medium text-[var(--muted)] transition-colors hover:bg-white/5 hover:text-[var(--text)]"
          >
            {t(manual ? 'tracking.cancel' : 'tracking.locate.dismiss')}
          </button>
        </div>
      </section>
    </div>
  )
}
