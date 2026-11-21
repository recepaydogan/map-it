import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { viewMarkerUrls } from "./er-map-reward-filters";
import { localizeRawMarkers } from "./er-map-localize";
import type {
  RawSpatialRecord,
  RawErMapMarker,
  ErMapEnemyProfile,
  ErMapItemIndex,
  ErMapManifest,
  ErMapViewDefinition,
} from "./types";

import type { Game } from "../../data/types";

const manifestUrlFor = (game: Game) => `/data/er-map/${game}/manifest.json`;
const ENEMY_PROFILES_URL = "/data/er-map/elden-ring/enemy-profiles.json";
const jsonCache = new Map<string, Promise<unknown>>();

const loadJson = <T,>(url: string): Promise<T> => {
  let request = jsonCache.get(url);
  if (!request) {
    request = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Unable to load ${url}: ${response.status}`);
      return response.json();
    });
    jsonCache.set(url, request);
  }
  return request as Promise<T>;
};

/** productionMarkerId → { view, id }: build-time bridge letting codex "show on
 * map" jumps (which carry PRODUCTION marker ids) land on this map's markers. */
export const loadProductionIdMap = () =>
  loadJson<Record<string, { view: string; id: string }>>(
    "/data/er-map/elden-ring/production-id-map.json",
  );

/** itemKey → the markers that hand the item over. ~2MB, so it rides the shared
 * json cache: the detail panel and the search both pull it, one fetch total. */
export const loadErMapItemIndex = () =>
  loadJson<ErMapItemIndex>("/data/er-map/elden-ring/item-index.json");

interface ManifestState {
  game: Game;
  manifest: ErMapManifest | null;
  error: string | null;
}

export const useErMapManifest = (game: Game) => {
  const [loaded, setLoaded] = useState<ManifestState>({ game, manifest: null, error: null });

  useEffect(() => {
    let active = true;
    loadJson<ErMapManifest>(manifestUrlFor(game))
      .then((value) => {
        if (active) setLoaded({ game, manifest: value, error: null });
      })
      .catch((reason: unknown) => {
        if (active) {
          setLoaded({ game, manifest: null, error: reason instanceof Error ? reason.message : String(reason) });
        }
      });
    return () => {
      active = false;
    };
  }, [game]);

  // While a game switch is in flight the previous game's manifest is still in
  // state; report "loading" (null) rather than hand back the wrong game's views.
  if (loaded.game !== game) return { manifest: null, error: null };
  return { manifest: loaded.manifest, error: loaded.error };
};

export const useErMapEnemyProfile = (npcParamId?: number) => {
  const [profile, setProfile] = useState<ErMapEnemyProfile | undefined>();

  useEffect(() => {
    let active = true;
    if (!npcParamId) {
      queueMicrotask(() => {
        if (active) setProfile(undefined);
      });
      return () => {
        active = false;
      };
    }

    loadJson<Record<string, ErMapEnemyProfile>>(ENEMY_PROFILES_URL)
      .then((profiles) => {
        if (active) setProfile(profiles[String(npcParamId)]);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        console.error("Unable to load ER map enemy profiles", reason);
        setProfile(undefined);
      });
    return () => {
      active = false;
    };
  }, [npcParamId]);

  return profile;
};

const spatialToMarker = (record: RawSpatialRecord): RawErMapMarker => ({
  id: record.id,
  source: "msb",
  name: record.name,
  category: record.type,
  areaNo: record.map.slice(1, 3),
  gridX: 16,
  gridZ: 16,
  localX: record.position.x,
  localY: record.position.y,
  localZ: record.position.z,
  map: record.map,
  section: record.section,
  type: record.type,
  entityId: record.entityId,
  eventId: record.eventId,
  regionId: record.regionId,
  modelName: record.modelName,
  npcParamId: record.npcParamId,
  thinkParamId: record.thinkParamId,
  charaInitId: record.charaInitId,
  itemLotId: record.itemLotId,
  objActId: record.objActId,
  linkedType: record.linkedType,
  reference: record.reference,
});

export const useErMapViewMarkers = (
  view: ErMapViewDefinition | null,
  activeCategories: Set<string>,
  loadAllCategories: boolean,
) => {
  // Re-renders on a language change; the text dictionary was already swapped by
  // then (data/localized-data.ts runs before the UI language flips), so the memo
  // below re-localizes with the right dictionary.
  const { t } = useTranslation();
  const [markers, setMarkers] = useState<RawErMapMarker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which view the CURRENT `markers` belong to. The map no longer remounts on a
  // view switch, so serving the old view's markers while the new view's chunks
  // load would draw them projected into the wrong layer's coordinate space.
  // Category-filter changes keep the same view and deliberately keep the stale
  // pool (clearing there would flash every pin off on each toggle).
  const markersViewKey = useRef<string | null>(null);
  // Reactive twin of the ref, stamped only when a view's load has actually
  // LANDED (not when it starts) — consumers use it to know "these markers are
  // view X's settled result", e.g. to decide a full-pool fallback only after
  // the active-chunk load had its chance to resolve a selection.
  const [loadedViewKey, setLoadedViewKey] = useState<string | null>(null);
  const urls = useMemo(() => {
    if (!view) return [];
    return viewMarkerUrls(view, activeCategories, loadAllCategories);
  }, [activeCategories, loadAllCategories, view]);

  useEffect(() => {
    let active = true;
    if (!view || urls.length === 0) {
      queueMicrotask(() => {
        if (!active) return;
        markersViewKey.current = view?.key ?? null;
        setMarkers([]);
        setLoadedViewKey(view?.key ?? null);
        setLoading(false);
      });
      return () => {
        active = false;
      };
    }
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError(null);
      if (markersViewKey.current !== view.key) {
        markersViewKey.current = view.key;
        setMarkers([]);
      }
    });
    Promise.all(urls.map((url) => loadJson<unknown[]>(url)))
      .then((chunks) => {
        if (!active) return;
        setLoadedViewKey(view.key);
        if (view.kind === "native") {
          const rows = chunks.flatMap((chunk) => chunk) as Array<RawSpatialRecord | RawErMapMarker>;
          const mapped = rows.map((row) => "source" in row ? row : spatialToMarker(row));
          setMarkers(mapped.filter((m) => m.type !== "part/dummy-enemy"));
          return;
        }
        const mapped = chunks.flatMap((chunk) => chunk) as RawErMapMarker[];
        setMarkers(mapped.filter((m) => m.type !== "part/dummy-enemy"));
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [urls, view]);

  const localizedMarkers = useMemo(() => localizeRawMarkers(markers, t), [markers, t]);

  return { markers: localizedMarkers, loading, error, loadedViewKey };
};
