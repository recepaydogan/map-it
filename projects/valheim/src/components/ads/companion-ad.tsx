import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { canUseOwAds, isAdWindowOpenState, loadOwAdsSdk } from './owads-sdk'

/** ER companion layout: a fixed 400 × 300 slot, kept alive while hidden. */
export function CompanionAd() {
  const { t } = useTranslation()
  const container = useRef<HTMLDivElement>(null)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    let disposed = false
    let ad: OwAdInstance | null = null
    let open = true
    const update = (state: string) => {
      open = isAdWindowOpenState(state)
      if (container.current) container.current.style.display = open ? '' : 'none'
    }
    const onState = (event: { window_name?: string; window_state_ex?: string }) => {
      if (event.window_name === 'companion') update(event.window_state_ex ?? '')
    }
    if (canUseOwAds()) {
      overwolf.windows.onStateChanged.addListener(onState)
      overwolf.windows.getCurrentWindow((result) => {
        if (!disposed && result.success) update(result.window.stateEx ?? result.window.state ?? '')
      })
    }
    void loadOwAdsSdk().then((loaded) => {
      if (disposed) return
      if (!loaded || !window.OwAd || !container.current) { setUnavailable(true); return }
      container.current.style.display = ''
      ad = new window.OwAd(container.current, { size: { width: 400, height: 300 }, containerId: 'vhm_companion' })
      container.current.style.display = open ? '' : 'none'
    })
    return () => {
      disposed = true
      if (canUseOwAds()) overwolf.windows.onStateChanged.removeListener(onState)
      void ad?.shutdown().catch(() => undefined)
    }
  }, [])
  return <footer className="craft-companion-ad" aria-label={t('planner.tracker.advertisement')}>
    <div ref={container} style={{ width: 400, height: 300 }} />
    {unavailable && <div className="craft-companion-ad-placeholder"><img src="/icon.png" alt="" width={48} height={48} /><span>{t('app.name')}</span></div>}
  </footer>
}
