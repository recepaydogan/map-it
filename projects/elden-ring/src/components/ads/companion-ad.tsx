import { useEffect, useRef, useState } from "react";
import { subscribeToCurrentWindowState } from "../../overwolf-utils/window-manager";
import {
  canUseOwAds,
  isAdWindowOpenState,
  loadOwAdsSdk,
  type OwAdsSdkState,
} from "./owads-sdk";

const AD_SIZE = { width: 400, height: 300 } as const;

/**
 * Bottom ad for the Roundtable companion window.
 *
 * A single 400x300 container — Overwolf's recommended layout for small,
 * always-on windows. The instance is created once and kept; its container is
 * toggled with `display:none` while the window is minimized, then revealed on
 * restore without forcing a new ad request.
 *
 * The container itself stays a fixed-size element with no children — both
 * required by Overwolf: its size/visibility must not change after creation, and
 * it may hold only the SDK-generated node. When ads can't load at all (dev
 * browser, SDK error) the footer keeps its height and shows a branded
 * placeholder, so the companion's dimensions never jump.
 */
const CompanionAd = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const adRef = useRef<OwAdInstance | null>(null);
  const [sdkState, setSdkState] = useState<OwAdsSdkState>("loading");

  // Is this window on screen (normal/maximized) rather than minimized/hidden?
  const [windowOpen, setWindowOpen] = useState(true);
  const windowOpenRef = useRef(windowOpen);
  useEffect(() => {
    windowOpenRef.current = windowOpen;
  }, [windowOpen]);
  useEffect(
    () => subscribeToCurrentWindowState((state) => setWindowOpen(isAdWindowOpenState(state))),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!canUseOwAds()) {
        if (!cancelled) setSdkState("unsupported");
        return;
      }
      const loaded = await loadOwAdsSdk();
      if (cancelled) return;
      setSdkState(loaded && window.OwAd ? "ready" : "error");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Create the instance exactly once, when the SDK is ready.
  useEffect(() => {
    if (sdkState !== "ready") return;
    const container = containerRef.current;
    if (!container || !window.OwAd || adRef.current) return;

    // Reveal before creating — a display:none container at creation time breaks
    // the OwAd SDK (it renders a permanent grey placeholder).
    container.style.display = "";
    adRef.current = new window.OwAd(container, {
      size: AD_SIZE,
      // Unique per surface, max 20 chars — never collides with the rail's ids.
      containerId: "era_companion",
    });
    if (!windowOpenRef.current) container.style.display = "none";

    return () => {
      if (!adRef.current) return;
      void adRef.current.shutdown().catch(() => undefined);
      adRef.current = null;
    };
  }, [sdkState]);

  // Pause / resume with the window's own state.
  const prevOpenRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (sdkState !== "ready") return;
    if (prevOpenRef.current === windowOpen) return;
    prevOpenRef.current = windowOpen;

    const container = containerRef.current;
    if (windowOpen) {
      if (container) container.style.display = "";
    } else if (container) {
      container.style.display = "none";
    }
  }, [windowOpen, sdkState]);

  const adUnavailable = sdkState === "unsupported" || sdkState === "error";

  return (
    <div className="flex shrink-0 justify-center border-t border-border bg-background px-3 py-3">
      {adUnavailable ? (
        <div className="flex h-[300px] w-[400px] flex-col items-center justify-center gap-3">
          <img src="/icon.png" alt="" draggable={false} className="h-12 w-12 opacity-70" />
          <p className="font-display text-[10px] uppercase tracking-[0.2em] text-subtle">
            ELDEN RING ATLAS
          </p>
        </div>
      ) : (
        <div ref={containerRef} className="h-[300px] w-[400px] overflow-hidden" />
      )}
    </div>
  );
};

export default CompanionAd;
