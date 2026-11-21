import { useEffect, useRef, useState } from "react";
import { isOnboardingActive, shouldAutoStartOnboarding, useOnboardingActive } from "../onboarding/use-onboarding";
import { UPDATES_VERSION } from "./updates-release";
import { hasUnreadUpdateVersion, lastReadUpdateVersion, useUpdateReadState } from "./use-update-read-state";

/** A first-run window stays in onboarding, including after the tour finishes. */
export function useAutoOpenUpdates(active: boolean, onOpen: () => void) {
  const [firstRun] = useState(shouldAutoStartOnboarding);
  const onboardingActive = useOnboardingActive();
  const handled = useRef(false);
  const { unread, markRead } = useUpdateReadState(UPDATES_VERSION);

  useEffect(() => {
    if (active && !onboardingActive) markRead();
  }, [active, onboardingActive, markRead]);

  useEffect(() => {
    if (firstRun || onboardingActive || shouldAutoStartOnboarding() || handled.current) return;
    if (active || !unread) { handled.current = true; return; }
    const timer = window.setTimeout(() => {
      if (isOnboardingActive() || shouldAutoStartOnboarding()) return;
      if (!hasUnreadUpdateVersion(lastReadUpdateVersion(), UPDATES_VERSION)) { handled.current = true; return; }
      handled.current = true;
      onOpen();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active, firstRun, onboardingActive, onOpen, unread]);
}
