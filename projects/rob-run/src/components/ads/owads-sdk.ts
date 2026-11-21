/**
 * Shared OwAds bootstrap.
 *
 * The SDK must be loaded from Overwolf's CDN (never bundled) and exactly once
 * per window, so every ad surface goes through this module instead of each
 * shipping its own loader.
 *
 * https://dev.overwolf.com/ow-native/reference/ads/owad/
 */

const OWADS_SDK_SRC = "https://content.overwolf.com/libs/ads/latest/owads.min.js";

export type OwAdsSdkState = "loading" | "ready" | "unsupported" | "error";

let owAdsSdkPromise: Promise<boolean> | null = null;

export const canUseOwAds = (): boolean =>
  typeof window !== "undefined" &&
  typeof overwolf !== "undefined" &&
  typeof document !== "undefined";

/**
 * Whether the window is in an "open" state (normal or maximized). Minimized /
 * hidden / closed count as "not open" — ads must be removed there.
 */
export const isAdWindowOpenState = (state: string): boolean =>
  state === "normal" || state === "maximized";

export const loadOwAdsSdk = async (): Promise<boolean> => {
  if (!canUseOwAds()) return false;
  if (window.OwAd) return true;
  if (owAdsSdkPromise) return owAdsSdkPromise;

  owAdsSdkPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector(
      'script[data-owads-sdk="true"]',
    ) as HTMLScriptElement | null;
    if (existing) {
      if (window.OwAd || existing.dataset.loaded === "true") {
        resolve(Boolean(window.OwAd));
        return;
      }
      existing.addEventListener("load", () => resolve(Boolean(window.OwAd)), {
        once: true,
      });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = OWADS_SDK_SRC;
    script.async = true;
    script.dataset.owadsSdk = "true";
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve(Boolean(window.OwAd));
      },
      { once: true },
    );
    script.addEventListener("error", () => resolve(false), { once: true });
    document.head.appendChild(script);
  });

  return owAdsSdkPromise;
};
