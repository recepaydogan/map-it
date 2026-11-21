import { useCallback, useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import { APP_CONFIG } from "../../config/app-config";
import { subscribeToCurrentWindowState } from "../../overwolf/window-manager";
import {
  canUseOwAds,
  isAdWindowOpenState,
  loadOwAdsSdk,
  type OwAdsSdkState,
} from "./owads-sdk";

const TOP_SIZE = { width: 400, height: 60 } as const;
const LARGE_SIZE = { width: 400, height: 600 } as const;

interface OverwolfAdRailProps {
  visible: boolean;
}

const OverwolfAdRail = ({ visible }: OverwolfAdRailProps) => {
  const topContainerRef = useRef<HTMLDivElement | null>(null);
  const largeContainerRef = useRef<HTMLDivElement | null>(null);
  const topAdRef = useRef<OwAdInstance | null>(null);
  const largeAdRef = useRef<OwAdInstance | null>(null);
  const adCleanupRef = useRef<(() => void) | null>(null);
  const activeRef = useRef(visible);
  const [sdkState, setSdkState] = useState<OwAdsSdkState>("loading");
  const [windowOpen, setWindowOpen] = useState(true);
  const [highImpactActive, setHighImpactActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!canUseOwAds()) {
        if (!cancelled) setSdkState("unsupported");
        return;
      }
      const loaded = await loadOwAdsSdk();
      if (!cancelled) setSdkState(loaded ? "ready" : "error");
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () =>
      subscribeToCurrentWindowState((state) => {
        setWindowOpen(isAdWindowOpenState(state));
      }),
    [],
  );

  const setContainerVisibility = useCallback((active: boolean) => {
    const display = active ? "" : "none";
    if (topContainerRef.current) topContainerRef.current.style.display = display;
    if (largeContainerRef.current) largeContainerRef.current.style.display = display;
  }, []);

  useEffect(() => {
    const active = visible && windowOpen;
    activeRef.current = active;
    setContainerVisibility(active);
  }, [visible, windowOpen, setContainerVisibility]);

  const shutdownTopAd = useCallback(() => {
    if (!topAdRef.current) return;
    void topAdRef.current.shutdown().catch(() => undefined);
    topAdRef.current = null;
  }, []);

  const ensureTopAd = useCallback(() => {
    if (!window.OwAd || !topContainerRef.current || topAdRef.current) return;
    topContainerRef.current.style.display = "";
    const topAd = new window.OwAd(topContainerRef.current, {
      size: TOP_SIZE,
      containerId: APP_CONFIG.adContainers.top,
    });
    topAdRef.current = topAd;
    if (!activeRef.current) topContainerRef.current.style.display = "none";
  }, []);

  useEffect(() => {
    if (sdkState !== "ready" || !visible || !window.OwAd || largeAdRef.current) return;
    if (!topContainerRef.current || !largeContainerRef.current) return;

    largeContainerRef.current.style.display = "";
    const largeAd = new window.OwAd(largeContainerRef.current, {
      size: LARGE_SIZE,
      enableHighImpact: true,
      containerId: APP_CONFIG.adContainers.large,
    });
    largeAdRef.current = largeAd;
    ensureTopAd();
    if (!activeRef.current) setContainerVisibility(false);

    const onHighImpactLoaded = () => {
      setHighImpactActive(true);
      shutdownTopAd();
    };
    const onHighImpactRemoved = () => {
      setHighImpactActive(false);
      window.setTimeout(ensureTopAd, 0);
    };

    largeAd.addEventListener("high-impact-ad-loaded", onHighImpactLoaded);
    largeAd.addEventListener("high-impact-ad-removed", onHighImpactRemoved);

    adCleanupRef.current = () => {
      largeAd.removeEventListener("high-impact-ad-loaded", onHighImpactLoaded);
      largeAd.removeEventListener("high-impact-ad-removed", onHighImpactRemoved);
      shutdownTopAd();
      void largeAd.shutdown().catch(() => undefined);
      largeAdRef.current = null;
    };
  }, [
    ensureTopAd,
    sdkState,
    setContainerVisibility,
    shutdownTopAd,
    visible,
  ]);

  useEffect(
    () => () => {
      adCleanupRef.current?.();
      adCleanupRef.current = null;
    },
    [],
  );

  if (sdkState === "unsupported" || sdkState === "error") {
    return null;
  }

  return (
    <aside
      aria-hidden={!visible}
      className={twMerge(
        "h-full min-h-[670px] w-[440px] min-w-[440px]",
        visible ? "flex flex-col items-center" : "hidden",
      )}
    >
      <div
        className={twMerge(
          highImpactActive
            ? "h-0 w-[400px] overflow-hidden"
            : "h-[60px] w-[400px] shrink-0 overflow-hidden",
        )}
      >
        <div
          ref={topContainerRef}
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
          ref={largeContainerRef}
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
