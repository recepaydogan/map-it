type OwAdEventCallback = (data: unknown) => void

interface OwAdSize {
  width: number
  height: number
}

interface OwAdOptions {
  size: OwAdSize
  containerId: string
  enableHighImpact?: boolean
  testAd?: boolean
  customTracking?: Record<string, string>
}

interface OwAdInstance {
  addEventListener(eventName: string, listener: OwAdEventCallback): void
  removeEventListener(eventName: string, listener: OwAdEventCallback): void
  pause(): boolean
  refreshAd(options: Record<string, unknown>): void
  removeAd(): void
  shutdown(): Promise<void>
}

interface OwAdConstructor {
  new (container: HTMLElement, options: OwAdOptions): OwAdInstance
}

interface Window {
  OwAd?: OwAdConstructor
}
