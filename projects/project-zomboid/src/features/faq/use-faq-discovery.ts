import { useCallback, useEffect, useState } from "react";
import { shouldAutoStartOnboarding } from "../onboarding/use-onboarding";
import {
  isFaqDiscoverySeen,
  isFaqDiscoveryStorageKey,
  markFaqDiscoverySeen,
  onFaqDiscoverySeen,
} from "./faq-discovery-state";

export const FAQ_DISCOVERY_DURATION_MS = 60_000;

/** One-time FAQ highlight for users who completed onboarding before FAQ existed. */
export const useFaqDiscovery = () => {
  const [attention, setAttention] = useState(
    () => !shouldAutoStartOnboarding() && !isFaqDiscoverySeen(),
  );

  const dismiss = useCallback(() => {
    markFaqDiscoverySeen();
    setAttention(false);
  }, []);

  useEffect(() => {
    const unsubscribe = onFaqDiscoverySeen(() => setAttention(false));
    const onStorage = (event: StorageEvent) => {
      if (isFaqDiscoveryStorageKey(event.key)) setAttention(false);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!attention) return;
    const timer = window.setTimeout(dismiss, FAQ_DISCOVERY_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [attention, dismiss]);

  return { attention, dismiss };
};
