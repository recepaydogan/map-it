/**
 * NitroPay globals. The loader and its queue stub are injected into web-build
 * HTML heads by the `nitropayAds` plugin (vite.config.ts) and are never present
 * in Overwolf builds — so every use of these must be behind an IS_WEB check.
 */
declare global {
  interface Window {
    nitroAds?: {
      createAd: (id: string, options: Record<string, unknown>) => Promise<unknown>;
      /** Set by the loader once the ad script has initialised. */
      loaded?: boolean;
    };
    /** IAB US Privacy API — present only for the US visitors the CMP targets. */
    __uspapi?: (command: string, version: number, callback?: (...args: unknown[]) => void) => void;
    /** NitroPay CMP command interface — present only for EU/EEA/UK visitors. */
    __cmp?: (command: string) => void;
    /** IAB TCF API — its presence is how a consent-region visitor is told apart. */
    __tcfapi?: unknown;
  }
}

export {};
