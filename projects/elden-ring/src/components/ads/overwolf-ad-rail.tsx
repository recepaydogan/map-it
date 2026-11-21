import React, { useCallback, useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import {
  canUseOwAds,
  isAdWindowOpenState as isOpenState,
  loadOwAdsSdk,
  type OwAdsSdkState as SdkState,
} from "./owads-sdk";

const BANNER_SIZE = { width: 400, height: 60 } as const;
const LARGE_SIZE = { width: 400, height: 600 } as const;

/**
 * Overwolf-compliant ad rail.
 *
 * Follows Overwolf's official ads-sample pattern:
 * https://github.com/overwolf/apis-sample-apps/blob/master/ads-sample/desktop.js
 *
 * Key rules respected here:
 *  - Load the SDK from Overwolf's CDN (never bundle it).
 *  - Create OwAd instances exactly once and reuse them.
 *  - On minimize/hide, set the managed containers to `display:none`.
 *  - On restore, reveal the same instances without forcing an ad refresh.
 *  - Only react to onStateChanged for the main window; ALT+TAB / focus loss
 *    does NOT change window state, so ads keep running behind other windows.
 */
const OverwolfAdRail: React.FC = () => {
  const topAdContainerRef = useRef<HTMLDivElement | null>(null);
  const largeAdContainerRef = useRef<HTMLDivElement | null>(null);
  const topAdRef = useRef<OwAdInstance | null>(null);
  const largeAdRef = useRef<OwAdInstance | null>(null);
  const [sdkState, setSdkState] = useState<SdkState>("loading");
  const [highImpactActive, setHighImpactActive] = useState(false);

  // Track whether the window is open (normal/maximized) vs minimized/hidden.
  const [windowOpen, setWindowOpen] = useState(true);
  const windowOpenRef = useRef(windowOpen);

  // Overwolf requires each ad container to carry a unique containerId (max 20
  // chars). The convention embeds the window so the desktop rail and the in-game
  // overlay rail — which render this same component — never collide on ad ids.
  // "desktop" for the main window (the in-game overlay_map window is ad-free and
  // no longer renders this rail).
  const windowSlugRef = useRef<string | null>(null);
  const [windowSlug, setWindowSlug] = useState<string | null>(null);

  // ── SDK bootstrap ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const bootstrapSdk = async () => {
      if (!canUseOwAds()) {
        if (!cancelled) setSdkState("unsupported");
        return;
      }

      const loaded = await loadOwAdsSdk();
      if (cancelled) return;

      if (!loaded || !window.OwAd) {
        setSdkState("error");
        return;
      }

      setSdkState("ready");
    };

    void bootstrapSdk();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Window state listener (minimize / restore) ─────────────────
  useEffect(() => {
    if (typeof overwolf === "undefined") return;

    let currentWindowName = "";
    overwolf.windows.getCurrentWindow((res) => {
      if (res.success && res.window) {
        currentWindowName = res.window.name;
        const slug = res.window.name === "main" ? "desktop" : "overlay";
        windowSlugRef.current = slug;
        setWindowSlug(slug);
        setWindowOpen(isOpenState(res.window.stateEx));
      } else {
        // Couldn't resolve the window — fall back so ads still load.
        windowSlugRef.current = "desktop";
        setWindowSlug("desktop");
      }
    });

    if (!overwolf.windows.onStateChanged) return;

    const handler = (event: {
      window_name?: string;
      window_state_ex?: string;
      window_previous_state_ex?: string;
    }) => {
      // Only handle state changes for the window this component is rendered in.
      if (!currentWindowName || (event.window_name && event.window_name !== currentWindowName)) return;

      const open = isOpenState(event.window_state_ex ?? "");
      setWindowOpen(open);
    };

    overwolf.windows.onStateChanged.addListener(handler);
    return () => {
      overwolf.windows.onStateChanged.removeListener(handler);
    };
  }, []);

  // ── Managed-container visibility based on window state ─────────
  const setAdContainerVisibility = useCallback((visible: boolean) => {
    const display = visible ? "" : "none";
    if (topAdContainerRef.current) topAdContainerRef.current.style.display = display;
    if (largeAdContainerRef.current) largeAdContainerRef.current.style.display = display;
  }, []);

  useEffect(() => {
    windowOpenRef.current = windowOpen;
    setAdContainerVisibility(windowOpen);
  }, [windowOpen, setAdContainerVisibility]);

  // ── Create ad instances ────────────────────────────────────────
  const shutdownTopBanner = useCallback(() => {
    if (!topAdRef.current) return;
    void topAdRef.current.shutdown().catch(() => undefined);
    topAdRef.current = null;
  }, []);

  const ensureTopBanner = useCallback(() => {
    if (!topAdContainerRef.current || !window.OwAd || topAdRef.current) return;
    const container = topAdContainerRef.current;
    // OwAd must be created in a measurable container; restore the hidden state
    // immediately afterward when the host window is not visible.
    container.style.display = "";
    topAdRef.current = new window.OwAd(container, {
      size: BANNER_SIZE,
      containerId: `era_top_${windowSlugRef.current ?? "desktop"}`,
    });
    if (!windowOpenRef.current) container.style.display = "none";
  }, []);

  useEffect(() => {
    if (sdkState !== "ready") return;
    // Wait until we know which window we're in so ad container ids are
    // window-specific (desktop vs overlay) rather than colliding.
    if (!windowSlug) return;
    if (
      !window.OwAd ||
      !topAdContainerRef.current ||
      !largeAdContainerRef.current
    )
      return;

    const cleanupTasks: Array<() => void> = [];

    const subscribe = (
      ad: OwAdInstance,
      eventName: string,
      listener: (data: unknown) => void,
    ) => {
      ad.addEventListener(eventName, listener);
      cleanupTasks.push(() => {
        ad.removeEventListener(eventName, listener);
      });
    };

    largeAdContainerRef.current.style.display = "";
    const largeAd = new window.OwAd(largeAdContainerRef.current, {
      size: LARGE_SIZE,
      enableHighImpact: true,
      containerId: `era_lg_${windowSlug}`,
    });
    largeAdRef.current = largeAd;

    ensureTopBanner();
    if (!windowOpenRef.current) setAdContainerVisibility(false);

    // High-impact takeover: hide the top banner while it runs, restore after.
    subscribe(largeAd, "high-impact-ad-loaded", () => {
      setHighImpactActive(true);
      shutdownTopBanner();
    });

    subscribe(largeAd, "high-impact-ad-removed", () => {
      setHighImpactActive(false);
      window.setTimeout(() => {
        ensureTopBanner();
      }, 0);
    });

    return () => {
      cleanupTasks.forEach((task) => task());
      shutdownTopBanner();

      if (largeAdRef.current) {
        void largeAdRef.current.shutdown().catch(() => undefined);
        largeAdRef.current = null;
      }
    };
  }, [sdkState, windowSlug, ensureTopBanner, setAdContainerVisibility, shutdownTopBanner]);

  if (sdkState === "unsupported" || sdkState === "error") {
    return null;
  }

  return (
    <aside className="flex h-full min-h-[670px] w-[440px] min-w-[440px] flex-col items-center animate-fade-up">
      <div
        className={twMerge(
          highImpactActive
            ? "h-0 w-[400px] overflow-hidden"
            : "h-[60px] w-[400px] shrink-0 overflow-hidden",
        )}
      >
        <div
          ref={topAdContainerRef}
          className="h-[60px] w-[400px] overflow-hidden"
        />
      </div>

      <div
        className={twMerge(
          highImpactActive
            ? "h-full w-full grow overflow-hidden"
            : "mt-[10px] h-[600px] w-[400px] shrink-0 overflow-hidden",
        )}
      >
        <div
          ref={largeAdContainerRef}
          className={twMerge(
            highImpactActive
              ? "h-full w-full overflow-hidden"
              : "h-[600px] w-[400px] overflow-hidden",
          )}
        />
      </div>
    </aside>
  );
};

export default OverwolfAdRail;
