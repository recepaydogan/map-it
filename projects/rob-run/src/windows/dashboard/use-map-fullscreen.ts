import { useCallback, useEffect, useRef, useState } from "react";
import { maximizeCurrentWindowForMap } from "../../overwolf-utils/window-manager";

export function useMapFullscreen(available: boolean) {
  const [active, setActive] = useState(false);
  const restoreWindow = useRef<(() => Promise<void>) | null>(null);
  const transitioning = useRef(false);

  const exit = useCallback(async () => {
    const restore = restoreWindow.current;
    if (!restore) return;
    restoreWindow.current = null;
    transitioning.current = true;
    setActive(false);
    try { await restore(); }
    catch (error) { console.warn("[map-fullscreen] Could not restore window", error); }
    finally { transitioning.current = false; }
  }, []);

  const toggle = async () => {
    if (!available || transitioning.current) return;
    if (restoreWindow.current) { await exit(); return; }
    transitioning.current = true;
    try {
      restoreWindow.current = await maximizeCurrentWindowForMap();
      setActive(true);
    } catch (error) { console.warn("[map-fullscreen] Could not maximize window", error); }
    finally { transitioning.current = false; }
  };

  useEffect(() => {
    if (!active) return;
    if (!available) { void exit(); return; }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) void exit();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active, available, exit]);

  return { active: active && available, toggle };
}
