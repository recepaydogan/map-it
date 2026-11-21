import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import RemoveAdsCta from "./remove-ads-cta";
import { useMainWindowOcclusion } from "./use-main-window-occlusion";
import {
  canUseOwAds,
  isAdWindowOpenState as isOpenState,
  loadOwAdsSdk,
  type OwAdsSdkState as SdkState,
} from "./owads-sdk";

const BANNER_SIZE = { width: 400, height: 60 } as const;
const LARGE_SIZE = { width: 400, height: 600 } as const;

const pauseLoadedVideo = (ad: OwAdInstance | null) => {
  try {
    ad?.pause();
  } catch (error) {
    console.warn("[Ad visibility] Unable to pause hidden video", error);
  }
};

/**
 * Overwolf-compliant ad rail.
 *
 * Follows Overwolf's official ads-sample pattern:
 * https://github.com/overwolf/apis-sample-apps/blob/master/ads-sample/desktop.js
 *
 * Key rules respected here:
 *  - Load the SDK from Overwolf's CDN (never bundle it).
 *  - Create OwAd instances exactly once and reuse them.
 *  - On minimize/hide, call removeAd() — do NOT destroy the instance.
 *  - On restore, call refreshAd() to bring ads back.
 *  - Stop displaying ads when the desktop main window is completely covered.
 */
const OverwolfAdRail: React.FC<{ onRemoveAds?: () => void; preview?: boolean }> = ({ onRemoveAds, preview = false }) => {
  const topAdContainerRef = useRef<HTMLDivElement | null>(null);
  const largeAdContainerRef = useRef<HTMLDivElement | null>(null);
  const topAdRef = useRef<OwAdInstance | null>(null);
  const largeAdRef = useRef<OwAdInstance | null>(null);
  const largeVideoReady = useRef(false);
  const [sdkState, setSdkState] = useState<SdkState>("loading");
  const [highImpactActive, setHighImpactActive] = useState(false);

  // Track whether the window is open (normal/maximized) vs minimized/hidden.
  const [windowOpen, setWindowOpen] = useState(true);

  // Overwolf requires each ad container to carry a unique containerId (max 20
  // chars). Any window that renders this component receives its own namespace.
  const windowSlugRef = useRef<string | null>(null);
  const [windowSlug, setWindowSlug] = useState<string | null>(null);
  const covered = useMainWindowOcclusion(windowSlug === "desktop");
  const adsLive = windowOpen && (windowSlug !== "desktop" || covered === false);
  const adsLiveRef = useRef(adsLive);
  const visibilityChecked = windowSlug !== "desktop" || covered !== null;

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

  // ── removeAd / refreshAd based on window state ─────────────────
  // Per Overwolf docs: don't destroy the OwAd instance on minimize.
  // Instead call removeAd() and later refreshAd() on restore.
  const prevWindowOpenRef = useRef(windowOpen);
  useEffect(() => {
    const wasOpen = prevWindowOpenRef.current;
    prevWindowOpenRef.current = windowOpen;

    if (wasOpen && !windowOpen) {
      // Window minimized / hidden → remove ads (keeps instance alive)
      topAdRef.current?.removeAd();
      largeAdRef.current?.removeAd();
    } else if (!wasOpen && windowOpen) {
      // Window restored → refresh ads
      topAdRef.current?.refreshAd({});
      largeAdRef.current?.refreshAd({});
    }
  }, [windowOpen]);

  useEffect(() => {
    adsLiveRef.current = adsLive;
    const display = adsLive ? "" : "none";
    if (topAdContainerRef.current) topAdContainerRef.current.style.display = display;
    if (largeAdContainerRef.current) largeAdContainerRef.current.style.display = display;
    if (!adsLive && largeVideoReady.current) pauseLoadedVideo(largeAdRef.current);
  }, [adsLive]);

  // ── Create ad instances ────────────────────────────────────────
  const shutdownTopBanner = useCallback(() => {
    if (!topAdRef.current) return;
    void topAdRef.current.shutdown().catch(() => undefined);
    topAdRef.current = null;
  }, []);

  const ensureTopBanner = useCallback(() => {
    if (!topAdContainerRef.current || !window.OwAd || topAdRef.current) return;
    const container = topAdContainerRef.current;
    container.style.display = "";
    topAdRef.current = new window.OwAd(container, {
      size: BANNER_SIZE,
      containerId: `gm_top_${windowSlugRef.current ?? "desktop"}`,
    });
    if (!adsLiveRef.current) container.style.display = "none";
  }, []);

  useEffect(() => {
    if (sdkState !== "ready") return;
    // Wait until the host window is known so ad container ids cannot collide.
    if (!windowSlug || !visibilityChecked) return;
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

    const largeContainer = largeAdContainerRef.current;
    largeContainer.style.display = "";
    const largeAd = new window.OwAd(largeContainer, {
      size: LARGE_SIZE,
      enableHighImpact: true,
      containerId: `gm_lg_${windowSlug}`,
    });
    largeAdRef.current = largeAd;

    ensureTopBanner();
    if (!adsLiveRef.current) {
      topAdContainerRef.current.style.display = "none";
      largeContainer.style.display = "none";
    }

    subscribe(largeAd, "player_loaded", () => {
      largeVideoReady.current = true;
      if (!adsLiveRef.current) pauseLoadedVideo(largeAd);
    });
    subscribe(largeAd, "display_ad_loaded", () => {
      largeVideoReady.current = false;
    });
    subscribe(largeAd, "complete", () => {
      largeVideoReady.current = false;
    });

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
      largeVideoReady.current = false;
    };
  }, [sdkState, windowSlug, visibilityChecked, ensureTopBanner, shutdownTopBanner]);

  if (!preview && (sdkState === "unsupported" || sdkState === "error")) {
    return null;
  }

  return (
    <aside className={cn(
      "flex shrink-0 flex-col items-center animate-fade-up",
      preview
        ? "h-[60px] w-full sm:h-full sm:w-[440px] sm:max-w-[48vw] min-[1000px]:min-h-[670px]"
        : "h-full min-h-[670px] w-[440px] min-w-[440px]",
    )}>
      <div
        className={cn(
          "w-[400px] overflow-hidden",
          highImpactActive ? "h-0" : "h-[60px] shrink-0",
          preview && "max-[999px]:hidden",
        )}
      >
        <div
          ref={topAdContainerRef}
          className="h-[60px] w-[400px] overflow-hidden"
        />
      </div>

      <div
        className={cn(
          "overflow-hidden",
          highImpactActive
            ? "h-full w-full grow"
            : "mt-[10px] h-[600px] w-[400px] shrink-0",
          preview && "max-[999px]:hidden",
        )}
      >
        <div
          ref={largeAdContainerRef}
          className={cn(
            "overflow-hidden",
            highImpactActive ? "h-full w-full" : "h-[600px] w-[400px]",
          )}
        />
      </div>
      {!highImpactActive && (
        // The fixed ad slots take their space first. Query only the leftover height.
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden [container-type:size]">
          <div className="mt-auto hidden shrink-0 [@container_(min-height:60px)]:block">
            <RemoveAdsCta onActivate={onRemoveAds} />
          </div>
        </div>
      )}
    </aside>
  );
};

export default OverwolfAdRail;
