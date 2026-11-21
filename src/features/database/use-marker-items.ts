import { contentUrl } from "../../lib/content-url";
import { useEffect, useState } from "react";
import type { ReferenceRewardRate } from "../reference/reference-types";

export interface MarkerItemSummary {
  id: string;
  name: string;
  grade: string;
  category: string;
  icon?: string;
  sourceScope?: "specific" | "shared";
  rewardRates?: ReferenceRewardRate[];
}

export interface MarkerRewardItem extends MarkerItemSummary {
  probability: number;
}

export interface MarkerRewardGroup {
  kind: "main" | "participation" | "shared" | "additional";
  items: MarkerRewardItem[];
  packages: { probability: number; count: number; family: "weapons" | "armor" | "accessories" | "items"; grade: string | null; items: MarkerRewardItem[] }[];
}

type MarkerItemsState =
  | { status: "loading" }
  | { status: "ready"; items: MarkerItemSummary[]; rewards: MarkerRewardGroup[] }
  | { status: "error" };

interface MarkerItemIndex { version: 1; maps: string[] }
interface MarkerItemChunk { version: 1; markers: Record<string, MarkerItemSummary[]>; rewards?: Record<string, MarkerRewardGroup[]> }

let indexPromise: Promise<Set<string>> | null = null;
const chunks = new Map<string, Promise<MarkerItemChunk>>();

const loadJson = async (path: string): Promise<unknown> => {
  const response = await fetch(contentUrl(`data/items/acquisition/marker-items/${path}`));
  if (!response.ok) throw new Error(`Marker items: HTTP ${response.status} for ${path}`);
  return response.json() as Promise<unknown>;
};

const loadIndex = () => {
  indexPromise ??= loadJson("index.json").then((value) => {
    const index = value as Partial<MarkerItemIndex>;
    if (index.version !== 1 || !Array.isArray(index.maps) || !index.maps.every((map) => typeof map === "string" && /^[a-z0-9-]+$/.test(map))) {
      throw new Error("Marker item index has an invalid format");
    }
    return new Set(index.maps);
  });
  return indexPromise;
};

const loadChunk = (mapId: string) => {
  const cached = chunks.get(mapId);
  if (cached) return cached;
  const promise = loadJson(`${mapId}.json`).then((value) => {
    const chunk = value as Partial<MarkerItemChunk>;
    if (chunk.version !== 1 || !chunk.markers || typeof chunk.markers !== "object") {
      throw new Error(`Marker item chunk ${mapId} has an invalid format`);
    }
    return chunk as MarkerItemChunk;
  });
  chunks.set(mapId, promise);
  return promise;
};

export const useMarkerItems = (mapId: string, markerId: string): MarkerItemsState => {
  const [state, setState] = useState<MarkerItemsState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    void loadIndex()
      .then((maps) => maps.has(mapId) ? loadChunk(mapId) : null)
      .then((chunk) => {
        if (active) setState({ status: "ready", items: chunk?.markers[markerId] ?? [], rewards: chunk?.rewards?.[markerId] ?? [] });
      })
      .catch((error: unknown) => {
        console.error("Failed to load marker items", error);
        if (active) setState({ status: "error" });
      });
    return () => { active = false; };
  }, [mapId, markerId]);

  return state;
};
