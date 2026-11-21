type OwAdEventCallback = (data: unknown) => void;

interface OwAdSize {
  width: number;
  height: number;
}

interface OwAdOptions {
  autoplay?: boolean;
  size?: OwAdSize | OwAdSize[];
  testAd?: boolean;
  enableHighImpact?: boolean;
  containerId?: string;
  adUnit?: string;
  customTracking?: Record<string, string | number | boolean>;
}

interface OwAdInstance {
  readonly uid: string | null;
  readonly version: string;
  play(): boolean;
  pause(): boolean;
  refreshAd(refreshOptions: unknown): boolean;
  refreshCurrentWFstep(): void;
  removeAd(): boolean;
  shutdown(): Promise<void>;
  addEventListener(eventName: string, listener: OwAdEventCallback): boolean;
  removeEventListener(eventName: string, listener: OwAdEventCallback): boolean;
}

interface OwAdConstructor {
  new (container: HTMLElement, options: OwAdOptions): OwAdInstance;
}

interface Window {
  OwAd?: OwAdConstructor;
}
