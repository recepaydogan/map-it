import { setCompanionAutoLaunch } from '../../../lib/analytics/craft-window-analytics'
import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PREFERENCES_CHANGED_EVENT, readPreferences } from '../../../store/preferences'

const readHintViews = (key: string): number => {
  try {
    const value = Number(localStorage.getItem(key) ?? 0)
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  } catch { return 3 }
}

export function CompanionAutoLaunch() {
  const { t } = useTranslation()
  const key = 'autoLaunchCompanion' as const
  const viewsKey = 'valheim-companion:auto-launch-hint:companion'
  const hintId = useId()
  const [showHint, setShowHint] = useState(() => readHintViews(viewsKey) < 3)
  const counted = useRef(false)
  const anchor = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!showHint) return
    if (!counted.current) {
      counted.current = true
      try { localStorage.setItem(viewsKey, String(Math.min(3, readHintViews(viewsKey) + 1))) } catch { /* Storage unavailable: do not interrupt the tracker. */ }
    }
    const timer = window.setTimeout(() => setShowHint(false), 60_000)
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !anchor.current?.contains(event.target)) setShowHint(false)
    }
    const dismissOnBlur = () => setShowHint(false)
    document.addEventListener('pointerdown', dismissOutside, true)
    window.addEventListener('blur', dismissOnBlur)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', dismissOutside, true)
      window.removeEventListener('blur', dismissOnBlur)
    }
  }, [showHint, viewsKey])
  const [preferences, setPreferences] = useState(readPreferences)
  useEffect(() => {
    const sync = () => setPreferences(readPreferences())
    window.addEventListener('storage', sync)
    window.addEventListener(PREFERENCES_CHANGED_EVENT, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(PREFERENCES_CHANGED_EVENT, sync)
    }
  }, [])
  return <div ref={anchor} className="craft-tracker-auto-anchor">
    <label className="craft-tracker-auto" title={t(`settings.${key}Description`)}>
    <input type="checkbox" role="switch" checked={preferences[key]} aria-label={t(`settings.${key}`)} aria-describedby={showHint ? hintId : undefined} onChange={(event) => setCompanionAutoLaunch(event.target.checked, 'window_toggle')} />
    <span>{t(preferences[key] ? 'planner.tracker.autoOn' : 'planner.tracker.autoOff')}</span>
  </label>
    {showHint && <div className="craft-tracker-auto-hint">
      <p id={hintId}>{t('planner.tracker.autoHint')}</p>
      <button type="button" onClick={() => setShowHint(false)} aria-label={t('planner.tracker.dismissHint')}><X size={12} aria-hidden="true" /></button>
    </div>}
  </div>
}
