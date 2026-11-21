import { useEffect, useState } from "react";
import { EVENT_GUIDE_CATALOG_PATH } from "../../game-config";
import { contentUrl } from "../../lib/content-url";

export interface EventGuideItem {
  name: string;
  icon: string;
  variant?: string;
}

export interface EventGuideCatalog {
  version: 1;
  startDate: string;
  endDateExclusive: string;
  items: Record<string, EventGuideItem>;
  attendance: { coinItemId: string; dailyCoins: number[] };
  candy: {
    fragmentItemId: string;
    keys: { color: "red" | "yellow" | "blue"; keyItemId: string; fragmentCost: number;
      rewards: { itemId: string; quantity: number }[] }[];
    locations: { mapId: string; markerId: string; entityId: string; color: string; faction: string; region: string }[];
  };
  abyss: { startDate: string; endDateExclusive: string; itemId: string; priceKina: number;
    minLevel: number; perCharacterWeeklyLimit: number };
  shopChanges: { odyleItemId: string; oldPerCharacterWeeklyLimit: number; newPerCharacterWeeklyLimit: number;
    removedPerServerWeeklyLimit: number; movedItemIds: string[]; twoWeekItemId: string };
  weeklyAbyssRewards: { itemId: string; missionIds: string[] };
  cosmetics: Record<"sets" | "weapons" | "pets" | "wings" | "accessories", string[]>;
  cosmeticsEndDateExclusive: string;
}

type State = { status: "loading" } | { status: "ready"; data: EventGuideCatalog } | { status: "error" };
let request: Promise<EventGuideCatalog> | undefined;

const loadGuide = () => {
  request ??= fetch(contentUrl(EVENT_GUIDE_CATALOG_PATH)).then(async (response) => {
    if (!response.ok) throw new Error(`Event guide: HTTP ${response.status}`);
    const data = await response.json() as EventGuideCatalog;
    if (data.version !== 1 || data.attendance.dailyCoins.length !== 14 || data.candy.keys.length !== 3
      || data.candy.locations.length !== 12 || !data.items || !data.abyss || !data.cosmetics) {
      throw new Error("Invalid event guide catalog");
    }
    return data;
  }).catch((error: unknown) => { request = undefined; throw error; });
  return request;
};

export const useEventGuide = (enabled = true): State => {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadGuide().then((data) => {
      if (!cancelled) setState({ status: "ready", data });
    }).catch((error: unknown) => {
      console.error("Failed to load event guide", error);
      if (!cancelled) setState({ status: "error" });
    });
    return () => { cancelled = true; };
  }, [enabled]);
  return state;
};
