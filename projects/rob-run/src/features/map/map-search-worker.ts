import { prepareGlobalSearch, searchGlobalCatalog, type GlobalSearchCatalog } from "./map-global-search";
import { searchMapDocuments, type MapSearchDocument } from "./map-fuzzy-search";
import type { MapCoordinate } from "./types";

export type MapSearchWorkerRequest =
  | { type: "global-init"; catalog: GlobalSearchCatalog; translations: Record<string, string> }
  | { type: "local-init"; documents: MapSearchDocument[] }
  | { type: "global-query"; id: number; query: string; mapId: string }
  | { type: "local-query"; id: number; query: string; origin: MapCoordinate | null };
export type MapSearchWorkerResponse =
  | { id: number; type: "global"; results: ReturnType<typeof searchGlobalCatalog> }
  | { id: number; type: "local"; indices: Uint32Array; scores: Float32Array }
  | { id: number; type: "error" };

let globalIndex: ReturnType<typeof prepareGlobalSearch> | null = null;
let localDocuments: MapSearchDocument[] = [];
let localIndices = new Map<string, number>();
let pending: Extract<MapSearchWorkerRequest, { id: number }> | null = null;
let scheduled = false;
const respond = (response: MapSearchWorkerResponse, transfer: Transferable[] = []) => self.postMessage(response, { transfer });

self.onmessage = (event: MessageEvent<MapSearchWorkerRequest>) => {
  const request = event.data;
  if (request.type === "global-init") {
    globalIndex = prepareGlobalSearch(request.catalog, (name, key) => request.translations[key ?? name] ?? name);
    return;
  }
  if (request.type === "local-init") {
    localDocuments = request.documents;
    localIndices = new Map(localDocuments.map(({ point }, index) => [point.id, index]));
    return;
  }
  // Drain queued messages before starting CPU work, keeping only the latest query.
  pending = request;
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    const latest = pending;
    pending = null;
    if (!latest) return;
    try {
      if (latest.type === "global-query" && globalIndex) {
        respond({ type: "global", id: latest.id, results: searchGlobalCatalog(globalIndex, latest.query, latest.mapId) });
      } else if (latest.type === "local-query") {
        const matches = searchMapDocuments(localDocuments, latest.query, latest.origin);
        const indices = new Uint32Array(matches.length), scores = new Float32Array(matches.length);
        matches.forEach(({ point, score }, index) => { indices[index] = localIndices.get(point.id)!; scores[index] = score; });
        // Broad searches can match every spawn. Transfer two compact buffers
        // instead of cloning tens of thousands of objects onto the UI thread.
        respond({ type: "local", id: latest.id, indices, scores }, [indices.buffer, scores.buffer]);
      } else respond({ type: "error", id: latest.id });
    } catch {
      respond({ type: "error", id: latest.id });
    }
  }, 0);
};
