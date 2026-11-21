const OWADS_SDK_SRC = 'https://content.overwolf.com/libs/ads/latest/owads.min.js'
const OWADS_SDK_TIMEOUT_MS = 15_000

export type OwAdsSdkState = 'loading' | 'ready' | 'unsupported' | 'error'

let sdkPromise: Promise<boolean> | null = null

export const canUseOwAds = (): boolean =>
  typeof window !== 'undefined' &&
  typeof overwolf !== 'undefined' &&
  typeof document !== 'undefined'

export const isAdWindowOpenState = (state: string): boolean =>
  state === 'normal' || state === 'maximized'

export const loadOwAdsSdk = async (): Promise<boolean> => {
  if (!canUseOwAds()) return false
  if (window.OwAd) return true
  if (sdkPromise) return sdkPromise

  const pending = new Promise<boolean>((resolve) => {
    let script = document.querySelector<HTMLScriptElement>('script[data-owads-sdk="true"]')
    if (script?.dataset.loaded === 'true' && !window.OwAd) {
      script.remove()
      script = null
    }

    const target = script ?? document.createElement('script')
    let settled = false
    const finish = (loaded: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      target.removeEventListener('load', onLoad)
      target.removeEventListener('error', onError)
      if (!loaded) target.remove()
      resolve(loaded)
    }
    const onLoad = () => {
      target.dataset.loaded = 'true'
      finish(Boolean(window.OwAd))
    }
    const onError = () => finish(false)
    const timeoutId = window.setTimeout(() => finish(false), OWADS_SDK_TIMEOUT_MS)

    target.addEventListener('load', onLoad, { once: true })
    target.addEventListener('error', onError, { once: true })
    if (!script) {
      target.src = OWADS_SDK_SRC
      target.async = true
      target.dataset.owadsSdk = 'true'
      document.head.appendChild(target)
    }
  })

  sdkPromise = pending
  const loaded = await pending
  if (!loaded && sdkPromise === pending) sdkPromise = null
  return loaded
}
