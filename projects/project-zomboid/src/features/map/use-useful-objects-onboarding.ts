import { useCallback, useEffect, useRef, useState } from "react";

/** Increment the suffix when the Useful objects introduction materially changes. */
const STORAGE_KEY = "pzim:feature-onboarding:useful-objects-v2";
const AVAILABLE_AT_KEY = `${STORAGE_KEY}:available-at`;
const FIRST_RUN_DELAY_MS = 30_000;

const readSeen = (): boolean => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const writeSeen = (): void => {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
};

const readAvailableAt = (): number | null => {
  try {
    const value = Number(localStorage.getItem(AVAILABLE_AT_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

const writeAvailableAt = (timestamp: number): void => {
  try {
    localStorage.setItem(AVAILABLE_AT_KEY, String(timestamp));
  } catch {
    // The in-memory timer still preserves the delay for this session.
  }
};

interface UsefulObjectsOnboardingOptions {
  eligible: boolean;
  menuOpen: boolean;
  blocked: boolean;
  firstRun: boolean;
  onboardingActive: boolean;
}

/** Coordinates the one-time Menu nudge and the contextual Useful objects coachmark. */
const useUsefulObjectsOnboarding = ({
  eligible,
  menuOpen,
  blocked,
  firstRun,
  onboardingActive,
}: UsefulObjectsOnboardingOptions) => {
  const [seen, setSeen] = useState(readSeen);
  const [delayElapsed, setDelayElapsed] = useState(() => {
    const availableAt = readAvailableAt();
    return !firstRun && (availableAt === null || availableAt <= Date.now());
  });
  const sawFirstRunTour = useRef(onboardingActive);
  const available = eligible && delayElapsed && !blocked && !seen;

  useEffect(() => {
    if (delayElapsed) return undefined;

    if (firstRun) {
      if (onboardingActive) {
        sawFirstRunTour.current = true;
        return undefined;
      }
      if (!sawFirstRunTour.current) return undefined;
    }

    const now = Date.now();
    const storedAvailableAt = readAvailableAt();
    const availableAt = storedAvailableAt && storedAvailableAt > now
      ? storedAvailableAt
      : now + FIRST_RUN_DELAY_MS;
    if (storedAvailableAt !== availableAt) writeAvailableAt(availableAt);

    const timer = window.setTimeout(() => setDelayElapsed(true), availableAt - now);
    return () => window.clearTimeout(timer);
  }, [delayElapsed, firstRun, onboardingActive]);

  const complete = useCallback(() => {
    writeSeen();
    setSeen(true);
  }, []);

  return {
    coachmarkVisible: available && menuOpen,
    menuNudgeVisible: available && !menuOpen,
    complete,
  };
};

export default useUsefulObjectsOnboarding;
