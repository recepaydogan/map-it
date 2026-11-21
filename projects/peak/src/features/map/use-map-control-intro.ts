import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeToCurrentWindowState } from "../../overwolf/window-manager";

const CONTROL_INTRO_DURATION_MS = 15_000;
const VISIBLE_WINDOW_STATES = new Set(["normal", "maximized"]);
const HIDDEN_WINDOW_STATES = new Set(["hidden", "minimized", "closed"]);

/**
 * Reveals auto-hiding map chrome for every fresh visible stretch. Overwolf
 * windows stay mounted while hidden, so a mount-only timer would run just once
 * per process instead of once per opening.
 */
const useMapControlIntro = (active = true): boolean => {
  const [visible, setVisible] = useState(active);
  const timeoutRef = useRef<number | null>(null);

  const clearRevealTimeout = useCallback(() => {
    if (timeoutRef.current === null) return;
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const reveal = useCallback(() => {
    clearRevealTimeout();
    setVisible(true);
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setVisible(false);
    }, CONTROL_INTRO_DURATION_MS);
  }, [clearRevealTimeout]);

  useEffect(() => {
    if (!active) {
      clearRevealTimeout();
      return;
    }

    const activationTimer = window.setTimeout(reveal, 0);
    return () => window.clearTimeout(activationTimer);
  }, [active, clearRevealTimeout, reveal]);

  useEffect(() => {
    if (!active) return;

    let disposed = false;
    let windowWasVisible: boolean | null = null;
    const unsubscribe = subscribeToCurrentWindowState((state) => {
      if (disposed) return;
      const normalizedState = state.toLowerCase();
      if (VISIBLE_WINDOW_STATES.has(normalizedState)) {
        if (windowWasVisible !== true) reveal();
        windowWasVisible = true;
      } else if (HIDDEN_WINDOW_STATES.has(normalizedState)) {
        windowWasVisible = false;
      }
    });

    let documentWasVisible = document.visibilityState === "visible";
    const handleDocumentVisibility = () => {
      const documentIsVisible = document.visibilityState === "visible";
      if (documentIsVisible && !documentWasVisible) reveal();
      documentWasVisible = documentIsVisible;
    };
    document.addEventListener("visibilitychange", handleDocumentVisibility);

    return () => {
      disposed = true;
      unsubscribe();
      document.removeEventListener("visibilitychange", handleDocumentVisibility);
    };
  }, [active, reveal]);

  useEffect(() => clearRevealTimeout, [clearRevealTimeout]);

  return active && visible;
};

export default useMapControlIntro;
