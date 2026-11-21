import { contentUrl } from "../../lib/content-url";
import { useEffect, useState } from "react";

export interface StorageServices {
  version: 1;
  npcs: Record<string, { portrait: string }>;
  costs: { line: number; server: number; character: number }[];
}

type StorageServicesState =
  | { status: "loading" }
  | { status: "ready"; data: StorageServices }
  | { status: "error" };

let catalogPromise: Promise<StorageServices> | null = null;

const loadCatalog = () => {
  catalogPromise ??= fetch(contentUrl(`data/storage-services.json`)).then(async (response) => {
    if (!response.ok) throw new Error(`Storage services: HTTP ${response.status}`);
    const data = await response.json() as StorageServices;
    if (data.version !== 1 || !data.npcs || !Array.isArray(data.costs)) {
      throw new Error("Invalid storage service catalog");
    }
    return data;
  }).catch((error: unknown) => {
    catalogPromise = null;
    throw error;
  });
  return catalogPromise;
};

export const useStorageServices = (enabled: boolean): StorageServicesState => {
  const [state, setState] = useState<StorageServicesState>({ status: "loading" });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadCatalog().then((data) => {
      if (active) setState({ status: "ready", data });
    }).catch((error: unknown) => {
      console.error("Failed to load storage services", error);
      if (active) setState({ status: "error" });
    });
    return () => { active = false; };
  }, [enabled]);

  return state;
};
