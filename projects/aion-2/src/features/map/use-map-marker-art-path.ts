import { useEffect, useState } from "react";
import { contentUrl } from "../../lib/content-url";
import { loadMarkerArtPath } from "./map-marker-alpha";

export const useMapMarkerArtPath = (source: string | undefined, enabled = true) => {
  const [result, setResult] = useState<{ source: string; path: string | null } | null>(null);
  useEffect(() => {
    if (!source || !enabled) return;
    let active = true;
    loadMarkerArtPath(contentUrl(source)).then((path) => {
      if (active) setResult({ source, path });
    }).catch((error: unknown) => {
      console.warn("Map marker silhouette could not be loaded; using its standard hit area.", error);
      if (active) setResult({ source, path: null });
    });
    return () => { active = false; };
  }, [source, enabled]);
  return {
    path: result?.source === source ? result?.path ?? null : null,
    loading: Boolean(source && enabled && result?.source !== source),
  };
};
