import { startTransition, useEffect, useRef, useState } from "react";
import type { MapSearchDocument, MapSearchMatch } from "./map-fuzzy-search";
import type { MapSearchWorkerRequest, MapSearchWorkerResponse } from "./map-search-worker";
import type { MapCoordinate } from "./types";

const EMPTY_MATCHES: MapSearchMatch[] = [];

export function useLocalMapSearch(documents: MapSearchDocument[], query: string, origin: MapCoordinate | null, enabled = true) {
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const originRef = useRef(origin);
  const [result, setResult] = useState<{ documents: MapSearchDocument[]; query: string; matches: MapSearchMatch[] } | null>(null);
  const [failed, setFailed] = useState<MapSearchDocument[] | null>(null);
  // Player movement must not rescan the catalog while the user is typing.
  useEffect(() => { originRef.current = origin; }, [origin]);
  useEffect(() => {
    if (!enabled || !documents.length) return;
    const worker = new Worker(new URL("./map-search-worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onerror = () => setFailed(documents);
    worker.postMessage({ type: "local-init", documents } satisfies MapSearchWorkerRequest);
    return () => { workerRef.current = null; worker.terminate(); };
  }, [documents, enabled]);
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const id = ++requestId.current;
    let cancelled = false;
    worker.onmessage = ({ data }: MessageEvent<MapSearchWorkerResponse>) => {
      if (cancelled || data.id !== requestId.current) return;
      if (data.type === "error") setFailed(documents);
      if (data.type !== "local") return;
      const matches: MapSearchMatch[] = [];
      for (let index = 0; index < data.indices.length; index++) {
        const point = documents[data.indices[index]]?.point;
        if (point) matches.push({ point, score: data.scores[index] });
      }
      startTransition(() => { setFailed(null); setResult({ documents, query, matches }); });
    };
    worker.postMessage({ type: "local-query", id, query, origin: originRef.current } satisfies MapSearchWorkerRequest);
    return () => { cancelled = true; };
  }, [documents, enabled, query]);
  return {
    matches: query.trim() && result?.documents === documents ? result.matches : EMPTY_MATCHES,
    resultQuery: result?.documents === documents ? result.query : "",
    pending: enabled && !!documents.length && !!query.trim() && failed !== documents && (result?.documents !== documents || result.query !== query),
    error: failed === documents,
  };
}
