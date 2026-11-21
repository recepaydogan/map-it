import { useEffect, useState } from "react";
import { shouldAutoStartOnboarding, useOnboardingActive } from "../onboarding/use-onboarding";
import { useAddonSync } from "./addon-sync-store";

const DISMISSED_KEY = "wfm:reload-reminder-dismissed:v4";
const dismissed = () => { try { return localStorage.getItem(DISMISSED_KEY) ?? ""; } catch { return ""; } };

export function useCharacterSyncPrompt(preview = false) {
  const addon = useAddonSync();
  const fingerprint = `${addon.addonVersion ?? "not-installed"}:${addon.installedAt ?? 0}`;
  const onboardingActive = useOnboardingActive();
  const [closed, setClosed] = useState(() => preview ? "" : dismissed());
  const visible = closed !== fingerprint && !onboardingActive && !shouldAutoStartOnboarding()
    && (preview || !(addon.status === "ready" && addon.savedAt && !addon.needsReload));
  useEffect(() => {
    if (preview) return;
    const sync = (event: StorageEvent) => { if (event.key === DISMISSED_KEY || event.key === null) setClosed(dismissed()); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [preview]);
  const dismiss = () => {
    setClosed(fingerprint);
    if (preview) return;
    try { localStorage.setItem(DISMISSED_KEY, fingerprint); }
    catch { /* Session dismissal still works. */ }
  };
  return { visible, dismiss };
}
