import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PREFERENCES_CHANGED_EVENT, readPreferences, writePreferences } from '../store/preferences'
import { isOverwolf } from '../utils/overwolf'
import { ToggleSwitch } from './toggle-switch'

/** A visible way to opt out of the next automatic full-map launch. */
export function InGameAutoOpenBanner() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(() => readPreferences().autoOpenInGameApp)
  const [dismissed, setDismissed] = useState(false)
  const [showAfterDisabling, setShowAfterDisabling] = useState(false)

  useEffect(() => {
    const sync = () => setEnabled(readPreferences().autoOpenInGameApp)
    const onState = (event: overwolf.windows.WindowStateChangedEvent) => {
      if (event.window_name === 'in_game' && ['normal', 'maximized'].includes(event.window_state_ex ?? event.window_state ?? '')) {
        setDismissed(false)
        setShowAfterDisabling(false)
      }
    }
    window.addEventListener('storage', sync)
    window.addEventListener(PREFERENCES_CHANGED_EVENT, sync)
    if (isOverwolf()) overwolf.windows.onStateChanged.addListener(onState)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(PREFERENCES_CHANGED_EVENT, sync)
      if (isOverwolf()) overwolf.windows.onStateChanged.removeListener(onState)
    }
  }, [])

  useEffect(() => {
    if (!showAfterDisabling || enabled) return
    const timer = window.setTimeout(() => setShowAfterDisabling(false), 30_000)
    return () => window.clearTimeout(timer)
  }, [enabled, showAfterDisabling])

  if (dismissed || (!enabled && !showAfterDisabling)) return null

  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-5 z-[1501] flex justify-center">
      <div className="pointer-events-auto relative max-w-full rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-[12px] text-[var(--text)] shadow-xl">
        <p className="pr-7">{t('settings.inGameAutoOpenHint')}</p>
        <div className="mt-2 flex items-center justify-center gap-2.5">
          <ToggleSwitch
            checked={enabled}
            label={t('settings.autoOpenInGameApp')}
            onChange={(checked) => {
              writePreferences({ ...readPreferences(), autoOpenInGameApp: checked })
              setEnabled(checked)
              setShowAfterDisabling(!checked)
            }}
          />
          <span role="status" aria-live="polite" className="text-[var(--muted)]">
            {t(enabled ? 'settings.inGameAutoOpenOn' : 'settings.inGameAutoOpenOff')}
          </span>
        </div>
        <button type="button" onClick={() => setDismissed(true)} aria-label={t('window.close')} className="absolute right-2 top-2 grid size-6 place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
