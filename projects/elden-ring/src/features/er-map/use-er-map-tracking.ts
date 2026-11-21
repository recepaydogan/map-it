import { useCallback, useEffect, useState } from "react";

// Historic key from the surface's TEST MAP era — NEVER rename it: users'
// found/favorite state lives under it, and a new key would silently wipe them.
const STORAGE_KEY = "elden-ring-test-map-tracking-v1";

interface StoredTracking {
  favorites?: string[];
  found?: string[];
  /** Declutter switches: hide every marker already ticked off / starred. Kept
   *  with the progress they act on, so they survive a reload like the rest. */
  hideCompleted?: boolean;
  hideFavorites?: boolean;
  /** Where each ticked-off marker lives: `"<viewKey>|<category>"`.
   *
   *  The map only streams the categories that are switched ON, so the moment a
   *  category is unticked its markers are gone and a count taken from what is
   *  loaded would collapse to nothing. This is the memory that keeps the rail's
   *  "1 / 17" saying 1 with the category — and the marker — hidden. Learned as
   *  markers load (see use-er-map-state), never guessed. */
  foundMeta?: Record<string, string>;
}

const readTracking = (): {
  favorites: Set<string>;
  found: Set<string>;
  hideCompleted: boolean;
  hideFavorites: boolean;
  foundMeta: Record<string, string>;
} => {
  const empty = {
    favorites: new Set<string>(),
    found: new Set<string>(),
    hideCompleted: false,
    hideFavorites: false,
    foundMeta: {},
  };
  if (typeof localStorage === "undefined") return empty;

  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as StoredTracking;
    return {
      favorites: new Set(stored.favorites ?? []),
      found: new Set(stored.found ?? []),
      hideCompleted: stored.hideCompleted ?? false,
      hideFavorites: stored.hideFavorites ?? false,
      foundMeta: stored.foundMeta ?? {},
    };
  } catch {
    return empty;
  }
};

const toggleInSet = (current: Set<string>, id: string) => {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

const useErMapTracking = () => {
  const [initial] = useState(readTracking);
  const [favorites, setFavorites] = useState(initial.favorites);
  const [foundMarkers, setFoundMarkers] = useState(initial.found);
  const [hideCompleted, setHideCompleted] = useState(initial.hideCompleted);
  const [hideFavorites, setHideFavorites] = useState(initial.hideFavorites);
  const [foundMeta, setFoundMeta] = useState(initial.foundMeta);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      favorites: [...favorites],
      found: [...foundMarkers],
      hideCompleted,
      hideFavorites,
      foundMeta,
    }));
  }, [favorites, foundMarkers, hideCompleted, hideFavorites, foundMeta]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((current) => toggleInSet(current, id));
  }, []);

  const toggleFound = useCallback((id: string) => {
    setFoundMarkers((current) => toggleInSet(current, id));
  }, []);

  /** Record where ticked-off markers live. Merge-only: an entry for a marker
   *  that is later un-ticked costs a few bytes and is simply never read, which
   *  is cheaper than tracking removals — and it is still right if the same
   *  marker is ticked again. */
  const rememberFound = useCallback((entries: Record<string, string>) => {
    setFoundMeta((current) => ({ ...current, ...entries }));
  }, []);

  return {
    favorites,
    foundMarkers,
    hideCompleted,
    setHideCompleted,
    hideFavorites,
    setHideFavorites,
    foundMeta,
    rememberFound,
    toggleFavorite,
    toggleFound,
  };
};

export default useErMapTracking;
