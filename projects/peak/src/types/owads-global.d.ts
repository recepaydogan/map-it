type OwAdEventCallback = (data: unknown) => void;

interface OwAdSize {
  width: number;
  height: number;
}

interface OwAdOptions {
  size?: OwAdSize | OwAdSize[];
  enableHighImpact?: boolean;
  containerId?: string;
}

interface OwAdInstance {
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

