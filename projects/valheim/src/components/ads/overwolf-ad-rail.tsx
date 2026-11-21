import { useCallback, useEffect, useRef, useState } from 'react'
import RemoveAdsCta from './remove-ads-cta'
import { useMainWindowOcclusion } from '../../hooks/use-main-window-occlusion'
import {
  canUseOwAds,
  isAdWindowOpenState,
  loadOwAdsSdk,
  type OwAdsSdkState,
} from './owads-sdk'

const TOP_BANNER_SIZE = { width: 400, height: 60 } as const
const LARGE_AD_SIZE = { width: 400, height: 600 } as const

const pauseLoadedVideo = (ad: OwAdInstance | null) => {
  try {
    ad?.pause()
  } catch {
    // The SDK may replace the video between player_loaded and pause().
  }
}

/** Keep ad instances and containers alive exactly like Elden Ring Atlas. */
export function OverwolfAdRail({ onRemoveAds, preview = false }: { onRemoveAds?: () => void; preview?: boolean }) {
  const topBannerContainer = useRef<HTMLDivElement | null>(null)
  const largeAdContainer = useRef<HTMLDivElement | null>(null)
  const topBannerAd = useRef<OwAdInstance | null>(null)
  const largeAd = useRef<OwAdInstance | null>(null)
  const largeVideoReady = useRef(false)
  const [sdkState, setSdkState] = useState<OwAdsSdkState>('loading')
  const [highImpactActive, setHighImpactActive] = useState(false)
  const [windowOpen, setWindowOpen] = useState(true)
  const windowSlugRef = useRef<string | null>(null)
  const [windowSlug, setWindowSlug] = useState<string | null>(null)
  const covered = useMainWindowOcclusion(windowSlug === 'desktop')
  const adsLive = windowOpen && (windowSlug !== 'desktop' || covered === false)
  const adsLiveRef = useRef(adsLive)
  const visibilityChecked = windowSlug !== 'desktop' || covered !== null

  useEffect(() => {
    let cancelled = false

    const bootstrapSdk = async () => {
      if (!canUseOwAds()) {
        if (!cancelled) setSdkState('unsupported')
        return
      }

      const loaded = await loadOwAdsSdk()
      if (cancelled) return
      setSdkState(loaded && window.OwAd ? 'ready' : 'error')
    }

    void bootstrapSdk()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof overwolf === 'undefined') return

    let currentWindowName = ''
    overwolf.windows.getCurrentWindow((result) => {
      if (result?.success && result.window) {
        currentWindowName = result.window.name
        const slug = result.window.name === 'main' ? 'desktop' : 'overlay'
        windowSlugRef.current = slug
        setWindowSlug(slug)
        setWindowOpen(isAdWindowOpenState(result.window.stateEx ?? result.window.state ?? ''))
        return
      }

      windowSlugRef.current = 'desktop'
      setWindowSlug('desktop')
    })

    const handler = (event: { window_name?: string; window_state_ex?: string }) => {
      if (!currentWindowName || (event.window_name && event.window_name !== currentWindowName)) return
      setWindowOpen(isAdWindowOpenState(event.window_state_ex ?? ''))
    }

    overwolf.windows.onStateChanged.addListener(handler)
    return () => overwolf.windows.onStateChanged.removeListener(handler)
  }, [])

  const setAdContainerVisibility = useCallback((visible: boolean) => {
    const display = visible ? '' : 'none'
    if (topBannerContainer.current) topBannerContainer.current.style.display = display
    if (largeAdContainer.current) largeAdContainer.current.style.display = display
  }, [])

  useEffect(() => {
    adsLiveRef.current = adsLive
    setAdContainerVisibility(adsLive)
    if (!adsLive && largeVideoReady.current) pauseLoadedVideo(largeAd.current)
  }, [adsLive, setAdContainerVisibility])

  const shutdownTopBanner = useCallback(() => {
    if (!topBannerAd.current) return
    void topBannerAd.current.shutdown().catch(() => undefined)
    topBannerAd.current = null
  }, [])

  const ensureTopBanner = useCallback(() => {
    if (!topBannerContainer.current || !window.OwAd || topBannerAd.current) return

    const container = topBannerContainer.current
    container.style.display = ''
    topBannerAd.current = new window.OwAd(container, {
      size: TOP_BANNER_SIZE,
      containerId: `vhm_top_${windowSlugRef.current ?? 'desktop'}`,
    })
    if (!adsLiveRef.current) container.style.display = 'none'
  }, [])

  useEffect(() => {
    if (sdkState !== 'ready' || !windowSlug || !visibilityChecked) return
    if (!window.OwAd || !topBannerContainer.current || !largeAdContainer.current) return
    const largeContainer = largeAdContainer.current

    const cleanupTasks: Array<() => void> = []
    const subscribe = (ad: OwAdInstance, eventName: string, listener: OwAdEventCallback) => {
      ad.addEventListener(eventName, listener)
      cleanupTasks.push(() => ad.removeEventListener(eventName, listener))
    }

    largeContainer.style.display = ''
    const currentLargeAd = new window.OwAd(largeContainer, {
      size: LARGE_AD_SIZE,
      enableHighImpact: true,
      containerId: `vhm_lg_${windowSlug}`,
    })
    largeAd.current = currentLargeAd

    ensureTopBanner()
    if (!adsLiveRef.current) setAdContainerVisibility(false)

    subscribe(currentLargeAd, 'player_loaded', () => {
      largeVideoReady.current = true
      if (!adsLiveRef.current) pauseLoadedVideo(currentLargeAd)
    })
    subscribe(currentLargeAd, 'display_ad_loaded', () => {
      largeVideoReady.current = false
    })
    subscribe(currentLargeAd, 'complete', () => {
      largeVideoReady.current = false
    })

    subscribe(currentLargeAd, 'high-impact-ad-loaded', () => {
      setHighImpactActive(true)
      shutdownTopBanner()
    })

    subscribe(currentLargeAd, 'high-impact-ad-removed', () => {
      setHighImpactActive(false)
      window.setTimeout(ensureTopBanner, 0)
    })

    return () => {
      cleanupTasks.forEach((task) => task())
      shutdownTopBanner()
      if (largeAd.current) {
        void largeAd.current.shutdown().catch(() => undefined)
        largeAd.current = null
      }
      largeVideoReady.current = false
    }
  }, [ensureTopBanner, sdkState, setAdContainerVisibility, shutdownTopBanner, visibilityChecked, windowSlug])

  if (!preview && (sdkState === 'unsupported' || sdkState === 'error')) return null

  return (
    <aside className="flex h-full min-h-[670px] w-[440px] min-w-[440px] flex-col items-center animate-fade-up">
      <div className={highImpactActive ? 'h-0 w-[400px] overflow-hidden' : 'h-[60px] w-[400px] shrink-0 overflow-hidden'}>
        <div
          ref={topBannerContainer}
          className="h-[60px] w-[400px] overflow-hidden"
        />
      </div>
      <div className={highImpactActive ? 'h-full w-full grow overflow-hidden' : 'mt-[10px] h-[600px] w-[400px] shrink-0 overflow-hidden'}>
        <div
          ref={largeAdContainer}
          className={
            highImpactActive
              ? 'h-full w-full overflow-hidden'
              : 'h-[600px] w-[400px] overflow-hidden'
          }
        />
      </div>
      {!highImpactActive && onRemoveAds && (
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden [container-type:size]">
          <div className="mt-auto hidden shrink-0 [@container_(min-height:60px)]:block">
            <RemoveAdsCta onActivate={onRemoveAds} />
          </div>
        </div>
      )}
    </aside>
  )
}
