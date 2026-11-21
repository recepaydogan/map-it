import { useCallback, useEffect, useRef, useState } from "react";

const MARKER_INTRO_DURATION_MS = 60_000;
const MARKER_INTRO_SEEN_KEY = "pz-map:marker-intro-seen";

const hasSeenMarkerIntro = () => {
  try {
    return window.localStorage.getItem(MARKER_INTRO_SEEN_KEY) === "1";
  } catch {
    return false;
  }
};

const markMarkerIntroSeen = () => {
  try {
    window.localStorage.setItem(MARKER_INTRO_SEEN_KEY, "1");
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
};

/** Highlight the entry point once, ending after one minute or as soon as it is used. */
const useMarkerIntro = () => {
  const [highlighted, setHighlighted] = useState(() => !hasSeenMarkerIntro());
  const timeoutRef = useRef<number | undefined>(undefined);
  const dismiss = useCallback(() => {
    window.clearTimeout(timeoutRef.current);
    setHighlighted(false);
  }, []);

  useEffect(() => {
    if (!highlighted) return;
    markMarkerIntroSeen();
    timeoutRef.current = window.setTimeout(dismiss, MARKER_INTRO_DURATION_MS);
    return () => window.clearTimeout(timeoutRef.current);
  }, [dismiss, highlighted]);

  return { highlighted, dismiss };
};

export default useMarkerIntro;
