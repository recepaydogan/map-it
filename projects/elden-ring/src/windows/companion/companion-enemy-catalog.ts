import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { categoriesByGame } from "../../data/categories";
import type { CategoryDef } from "../../data/types";
import { localizeRawMarkers } from "../../features/er-map/er-map-localize";
import type { ErMapManifest, RawErMapMarker } from "../../features/er-map/types";
import {
  bestFuzzyScore,
  bestMatchScore,
  fuzzyScore,
  matchScore,
  NO_MATCH,
  searchQuery,
} from "../../lib/search-match";

/** Where a region-only hit sorts: behind every name hit, literal or loose. */
const REGION_SCORE = 3;

/**
 * The companion's REGULAR-enemy catalog — the rest of the map's "Bosses &
 * Enemies" group.
 *
 * The boss list (companion-boss-list) is built from the bundled marker set, which
 * holds bosses and minibosses only: every ordinary enemy in the game lives in the
 * ER map's streamed chunk files instead. So a search for "Man-Bat" could never
 * have hit anything — the window had never loaded the data it was in. This module
 * is that data, on the same terms the map uses it.
 *
 * Manifest-driven end to end: which categories belong to the group, what each is
 * called, and which files hold them all come from the map's own manifest, so this
 * list is exactly the group the filter rail shows and can't drift from it.
 *
 * ~2MB across nine files, so it loads on the first SEARCH rather than at mount —
 * an unsearched Boss tab pays nothing.
 */

const MANIFEST_URL = "/data/er-map/elden-ring/manifest.json";

/** The manifest group the enemy families are filed under (see data/categories:
 *  the same key the base "Bosses & Enemies" group uses). */
const COMBAT_GROUP = "bosses";

/** Placeholder MSB rows — the map drops these before drawing, so does this. */
const DUMMY_TYPE = "part/dummy-enemy";

export interface CompanionEnemy {
  /** The representative placement, LOCALIZED (enName holds the English original,
   *  which is what enemy portraits are keyed by). */
  marker: RawErMapMarker;
  name: string;
  region?: string;
  category: string;
  /** How many placements of this enemy this one row stands for. */
  count: number;
}

interface EnemyGroup {
  raw: RawErMapMarker;
  count: number;
}

const loadJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load ${url}: ${response.status}`);
  return response.json() as Promise<T>;
};

/**
 * One row per name+region, not per spawn: Man-Bat alone is placed 93 times, and
 * as individual rows a search would be nothing but the same name repeating. The
 * region stays in the key because it's the one axis that changes the fight —
 * region scaling is what sets an enemy's real HP.
 */
const groupByNameAndRegion = (rows: RawErMapMarker[]): EnemyGroup[] => {
  const groups = new Map<string, EnemyGroup>();
  for (const row of rows) {
    if (!row.name || row.type === DUMMY_TYPE) continue;
    const key = `${row.category}|${row.region ?? row.areaNo}|${row.name}`;
    const entry = groups.get(key);
    if (entry) entry.count += 1;
    else groups.set(key, { raw: row, count: 1 });
  }
  return [...groups.values()].sort((a, b) => a.raw.name.localeCompare(b.raw.name));
};

/** Category defs for the enemy families, straight from the manifest — the app's
 *  own dictionary has no entry for them (they exist only on the ER map). */
let categoryDefs = new Map<string, CategoryDef>();
let byId = new Map<string, RawErMapMarker>();
let request: Promise<EnemyGroup[]> | null = null;

const loadEnemyGroups = (): Promise<EnemyGroup[]> => {
  request ??= loadJson<ErMapManifest>(MANIFEST_URL)
    .then(async (manifest) => {
      const categories = manifest.categories.filter((entry) => entry.group === COMBAT_GROUP);
      categoryDefs = new Map(categories.map((entry) => [entry.key, entry]));
      const urls = manifest.views.flatMap((view) =>
        categories
          .map((entry) => view.chunks?.[entry.key])
          .filter((url): url is string => Boolean(url)),
      );
      const chunks = await Promise.all(urls.map((url) => loadJson<RawErMapMarker[]>(url)));
      const groups = groupByNameAndRegion(chunks.flat());
      byId = new Map(groups.map((group) => [group.raw.id, group.raw]));
      return groups;
    })
    .catch((reason: unknown) => {
      // Let the next search try again rather than caching the failure.
      request = null;
      console.error("Unable to load the companion enemy catalog", reason);
      return [];
    });
  return request;
};

/** The raw record behind an enemy page, by marker id (null before the catalog
 *  has loaded — a page is only ever opened from a loaded list). */
export const companionEnemyById = (id: string): RawErMapMarker | null => byId.get(id) ?? null;

/**
 * Display metadata for an enemy's category. The app's own dictionary answers for
 * anything that exists in both places (teardrop scarabs); the manifest covers the
 * four enemy families, which exist only on the map.
 */
export const companionEnemyCategory = (
  key: string,
  label: string,
): CategoryDef | undefined => {
  const base = categoriesByGame["elden-ring"].find((entry) => entry.key === key)
    ?? categoryDefs.get(key);
  return base ? { ...base, label } : undefined;
};

/**
 * The catalog, localized for the current language. Loads on first `enabled` and
 * then stays — a player who searched once will search again.
 *
 * `loading` matters: an empty catalog and a catalog still on the wire look
 * identical from the outside, and telling someone "no match" while their answer
 * is still downloading is the one thing this must never do.
 */
export const useCompanionEnemies = (
  enabled: boolean,
): { enemies: CompanionEnemy[]; loading: boolean } => {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<EnemyGroup[] | null>(null);

  useEffect(() => {
    if (!enabled || groups) return;
    let active = true;
    void loadEnemyGroups().then((loaded) => {
      if (active) setGroups(loaded);
    });
    return () => {
      active = false;
    };
  }, [enabled, groups]);

  // Names and regions are localized on a COPY (ids and relationships inherited
  // verbatim), so this re-runs per language exactly like the map's own markers.
  const enemies = useMemo(() => {
    if (!groups) return [];
    const localized = localizeRawMarkers(groups.map((group) => group.raw), t);
    return localized.map((marker, index) => ({
      marker,
      name: marker.name,
      region: marker.region,
      category: marker.category,
      count: groups[index].count,
    }));
  }, [groups, t]);

  return { enemies, loading: enabled && groups === null };
};

/**
 * Matches the localized name AND the English original — so "manbat" finds
 * Man-Bat whatever language the app is in — plus the region as a weaker last
 * resort. Separator- and accent-blind; see lib/search-match.
 */
export const filterCompanionEnemies = (
  enemies: CompanionEnemy[],
  rawQuery: string,
): CompanionEnemy[] => {
  const query = searchQuery(rawQuery);
  if (query.empty) return [];

  const collect = (
    name: (values: (string | undefined)[]) => number,
    region: (value: string | undefined) => number,
  ) => {
    const out: { enemy: CompanionEnemy; score: number }[] = [];
    for (const enemy of enemies) {
      let score = name([enemy.name, enemy.marker.enName]);
      if (score === NO_MATCH) {
        if (region(enemy.region) === NO_MATCH) continue;
        score = REGION_SCORE;
      }
      out.push({ enemy, score });
    }
    return out;
  };

  // Typos only rescue a dead end — see lib/search-match.
  let scored = collect(
    (values) => bestMatchScore(values, query),
    (value) => matchScore(value, query),
  );
  if (scored.length === 0) {
    scored = collect(
      (values) => bestFuzzyScore(values, query),
      (value) => fuzzyScore(value, query),
    );
  }

  return scored
    .sort((a, b) => a.score - b.score || a.enemy.name.localeCompare(b.enemy.name))
    .map((entry) => entry.enemy);
};
