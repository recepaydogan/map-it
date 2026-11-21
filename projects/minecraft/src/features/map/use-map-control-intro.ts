import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeToCurrentWindowState } from "../../overwolf-utils/window-manager";

const CONTROL_INTRO_DURATION_MS = 15_000;
const VISIBLE_WINDOW_STATES = new Set(["normal", "maximized"]);
const HIDDEN_WINDOW_STATES = new Set(["hidden", "minimized", "closed"]);

/** Reveals auto-hiding map chrome on activation/window visibility, optionally once per session key. */
interface MapControlIntroOptions {
  durationMs?: number;
  revealKey?: string | null;
  revealOncePerKey?: boolean;
}

const useMapControlIntro = (active = true, options: MapControlIntroOptions = {}): boolean => {
  const { durationMs = CONTROL_INTRO_DURATION_MS, revealKey = null, revealOncePerKey = false } = options;
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const revealedKeyRef = useRef<string | null>(null);
  const windowVisibleRef = useRef<boolean | null>(typeof overwolf === "undefined" ? true : null);

  const clearRevealTimeout = useCallback(() => {
    if (timeoutRef.current === null) return;
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const reveal = useCallback(() => {
    if (!active) return;
    if (revealOncePerKey) {
      if (!revealKey || revealedKeyRef.current === revealKey) return;
      if (windowVisibleRef.current !== true) return;
      revealedKeyRef.current = revealKey;
    }
    clearRevealTimeout();
    setVisible(true);
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setVisible(false);
    }, durationMs);
  }, [active, clearRevealTimeout, durationMs, revealKey, revealOncePerKey]);

  useEffect(() => {
    if (!active) {
      clearRevealTimeout();
      return;
    }

    const activationTimer = window.setTimeout(() => {
      if (!revealOncePerKey || windowVisibleRef.current === true) reveal();
    }, 0);
    return () => window.clearTimeout(activationTimer);
  }, [active, clearRevealTimeout, reveal, revealOncePerKey]);

  useEffect(() => {
    if (!active) return;

    let disposed = false;
    let windowWasVisible: boolean | null = null;
    const unsubscribe = subscribeToCurrentWindowState((state) => {
      if (disposed) return;
      const normalizedState = state.toLowerCase();
      if (VISIBLE_WINDOW_STATES.has(normalizedState)) {
        windowVisibleRef.current = true;
        if (windowWasVisible !== true) reveal();
        windowWasVisible = true;
      } else if (HIDDEN_WINDOW_STATES.has(normalizedState)) {
        windowVisibleRef.current = false;
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
