import { contentUrl } from "../../lib/content-url";
import { useEffect, useState } from "react";

type MerchantLocations = Record<string, string[]>;
type LoadState = { status: "loading" } | { status: "ready"; npcs: MerchantLocations } | { status: "error" };

let request: Promise<MerchantLocations> | null = null;

function loadMerchantLocations() {
  request ??= fetch(contentUrl(`data/map-search/merchant-locations.json`))
    .then(async (response) => {
      if (!response.ok) throw new Error(`Merchant locations: HTTP ${response.status}`);
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || !("version" in data) || data.version !== 1
        || !("npcs" in data) || !data.npcs || typeof data.npcs !== "object" || Array.isArray(data.npcs)) {
        throw new Error("Invalid merchant locations");
      }
      return data.npcs as MerchantLocations;
    })
    .catch((error: unknown) => { request = null; throw error; });
  return request;
}

export function useMerchantMapLocations(enabled: boolean): LoadState {
  const [result, setResult] = useState<LoadState>({ status: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadMerchantLocations().then((npcs) => {
      if (!cancelled) setResult({ status: "ready", npcs });
    }).catch((error: unknown) => {
      console.error("Failed to load merchant locations", error);
      if (!cancelled) setResult({ status: "error" });
    });
    return () => { cancelled = true; };
  }, [enabled]);
  return enabled ? result : { status: "loading" };
}
