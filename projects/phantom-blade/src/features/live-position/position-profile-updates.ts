import { POSITION_PROFILES_URL } from "../../game-config";
import bundledProfiles from "../../../native/position-reader/profiles-v1.json";
import { MAX_PROFILE_CATALOG_LENGTH, parsePositionProfileCatalog } from "./position-profile-catalog";

const CACHE_KEY = "phantom-blade-app:position-profiles-v1";
const REQUEST_TIMEOUT_MS = 8_000;

type ApplyProfiles = (json: string, callback: (result: { success: boolean }) => void) => void;

export const startPositionProfileUpdates = (apply: ApplyProfiles) => {
  let stopped = false;
  let request: AbortController | undefined;
  const cached = localStorage.getItem(CACHE_KEY);
  const catalog = cached && parsePositionProfileCatalog(cached);
  let active = JSON.stringify(catalog || bundledProfiles);
  apply(active, () => {});

  const refresh = async () => {
    if (stopped || request) return;
    const controller = new AbortController();
    request = controller;
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(POSITION_PROFILES_URL, {
        cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal,
      });
      if (!response.ok || Number(response.headers.get("content-length")) > MAX_PROFILE_CATALOG_LENGTH) return;
      const next = parsePositionProfileCatalog(await response.text());
      if (stopped || !next) return;
      const json = JSON.stringify(next);
      if (json === active) return;
      apply(json, ({ success }) => {
        if (stopped || !success) return;
        active = json;
        try { localStorage.setItem(CACHE_KEY, json); } catch { /* The reader already applied it. */ }
      });
    } catch {
      // Keep the last accepted catalog during CDN or network outages.
    } finally {
      clearTimeout(timeout);
      request = undefined;
    }
  };

  return {
    refresh,
    stop: () => {
      stopped = true;
      request?.abort();
    },
  };
};
