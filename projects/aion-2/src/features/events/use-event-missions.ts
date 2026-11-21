import { useEffect, useState } from "react";
import { contentUrl } from "../../lib/content-url";
import { EVENT_MISSIONS_CATALOG_PATH } from "../../game-config";

export interface EventMissionCatalog {
  version: 1;
  eventId: number;
  startDate: string;
  endDateExclusive: string;
  reward: { itemId: string; name: string; icon: string };
  missions: {
    id: string;
    achievementIds: { Light: number; Dark: number };
    title: string;
    objective: string;
    requiredCount: number;
    objectiveType: string;
    rewardAmount: number;
  }[];
  merchantLocations: { mapId: string; markerId: string; npcId: string; faction: string; region: string }[];
}

type State = { status: "loading" } | { status: "ready"; data: EventMissionCatalog } | { status: "error" };
let request: Promise<EventMissionCatalog> | undefined;

const loadCatalog = () => {
  request ??= fetch(contentUrl(EVENT_MISSIONS_CATALOG_PATH)).then(async (response) => {
    if (!response.ok) throw new Error(`Event mission catalog: HTTP ${response.status}`);
    const data = await response.json() as EventMissionCatalog;
    if (data.version !== 1 || !Array.isArray(data.missions) || !Array.isArray(data.merchantLocations)) {
      throw new Error("Invalid event mission catalog");
    }
    return data;
  }).catch((error: unknown) => { request = undefined; throw error; });
  return request;
};

export const useEventMissions = (enabled = true): State => {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadCatalog().then((data) => {
      if (!cancelled) setState({ status: "ready", data });
    }).catch((error: unknown) => {
      console.error("Failed to load event missions", error);
      if (!cancelled) setState({ status: "error" });
    });
    return () => { cancelled = true; };
  }, [enabled]);
  return state;
};
