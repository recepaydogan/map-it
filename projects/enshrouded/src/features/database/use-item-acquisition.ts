import { contentUrl } from "../../lib/content-url";
import { useEffect, useState } from "react";
import type { ItemAcquisition } from "./item-database-types";
import { loadCollectableItemSources } from "./collectable-item-acquisition";

type AcquisitionState =
  | { status: "loading" }
  | { status: "ready"; acquisition: ItemAcquisition | null }
  | { status: "error" };

interface AcquisitionIndex {
  version: 1;
  prefixes: string[];
}

interface AcquisitionChunk {
  version: 1;
  items: Record<string, ItemAcquisition>;
}

let indexPromise: Promise<Set<string>> | null = null;
const chunkPromises = new Map<string, Promise<AcquisitionChunk>>();

const loadJson = async (path: string): Promise<unknown> => {
  const response = await fetch(contentUrl(`data/items/acquisition/${path}`));
  if (!response.ok) throw new Error(`Item acquisition: HTTP ${response.status} for ${path}`);
  return response.json() as Promise<unknown>;
};

const loadIndex = (): Promise<Set<string>> => {
  indexPromise ??= loadJson("index.json").then((value) => {
    const index = value as Partial<AcquisitionIndex>;
    if (index.version !== 1 || !Array.isArray(index.prefixes) || !index.prefixes.every((prefix) => typeof prefix === "string" && /^\d{4}$/.test(prefix))) {
      throw new Error("Item acquisition index has an invalid format");
    }
    return new Set(index.prefixes);
  });
  return indexPromise;
};

const loadChunk = (prefix: string): Promise<AcquisitionChunk> => {
  const cached = chunkPromises.get(prefix);
  if (cached) return cached;
  const promise = loadJson(`${prefix}.json`).then((value) => {
    const chunk = value as Partial<AcquisitionChunk>;
    if (chunk.version !== 1 || !chunk.items || typeof chunk.items !== "object") {
      throw new Error(`Item acquisition chunk ${prefix} has an invalid format`);
    }
    return chunk as AcquisitionChunk;
  });
  chunkPromises.set(prefix, promise);
  return promise;
};

export const useItemAcquisition = (itemId: string): AcquisitionState => {
  const [state, setState] = useState<AcquisitionState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    const prefix = itemId.slice(0, 4);
    void Promise.all([
      loadIndex().then((prefixes) => prefixes.has(prefix) ? loadChunk(prefix) : null),
      loadCollectableItemSources(itemId),
    ])
      .then(([chunk, collectable]) => {
        const acquisition = chunk?.items[itemId] ?? null;
        if (active) setState({
          status: "ready",
          acquisition: collectable.length
            ? { ...(acquisition ?? { drops: [], merchants: [], gathering: [], shops: [], crafting: [], pickups: [], coinShops: [] }), pickups: [...(acquisition?.pickups ?? []), ...collectable] }
            : acquisition,
        });
      })
      .catch((error: unknown) => {
        console.error("Failed to load item acquisition data", error);
        if (active) setState({ status: "error" });
      });
    return () => { active = false; };
  }, [itemId]);

  return state;
};
