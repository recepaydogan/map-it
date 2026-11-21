import { markersByGame } from "../../data/markers";
import type { Marker } from "../../data/types";
// The overlay advises on EVERY boss/miniboss with combat intel — the map's
// Build-tab gate (hasBuildAdvisor) was narrowed to marquee fights only and no
// longer describes this list, so the gate lives here.
const LIST_CATEGORIES = new Set(["boss", "miniboss"]);
import { fuzzyScore, matchScore, NO_MATCH, searchQuery } from "../../lib/search-match";

/** Where a region-only hit sorts: behind every name hit, literal or loose. */
const REGION_SCORE = 3;

/**
 * The companion's boss catalog: every Elden Ring marker the Build Advisor can
 * actually plan against — a boss/miniboss/elite carrying a real NpcParam
 * resistance table (see has-build-advisor).
 *
 * The frozen marker set holds one entry per PLACED instance, so the same fight
 * appears many times over (Night's Cavalry 13×, one per region). A flat picker
 * of 882 rows is unusable, so instances are collapsed per name+REGION — the one
 * axis that genuinely changes the fight, since the region's scaling multiplier
 * is what sets the boss's real HP. Within a group the toughest instance wins
 * (highest scaled HP, id as the tie-break) so the plan is never dialled against
 * the weakest copy of a fight the player is probably meeting later.
 *
 * Names/regions here are LOCALIZED (markersByGame is a live binding rebuilt on
 * language change), so callers must rebuild this list per language. Marker ids
 * are not — which is why they, not names, are what gets persisted.
 */
export interface CompanionBoss {
  marker: Marker;
  /** Localized display name. */
  name: string;
  /** Localized region, when the marker carries one. */
  region?: string;
  /** Real health-bar HP, region scaling included. */
  hp?: number;
  /** "boss" ranks above "miniboss" in the list. */
  category: string;
}

const rank = (category: string) => (category === "boss" ? 0 : 1);

export const buildCompanionBossList = (): CompanionBoss[] => {
  const groups = new Map<string, Marker>();
  for (const marker of markersByGame["elden-ring"]) {
    if (!marker.bossMeta?.combat) continue;
    if (!LIST_CATEGORIES.has(marker.category)) continue;
    const key = `${marker.name}|${marker.region ?? ""}`;
    const current = groups.get(key);
    if (
      !current ||
      (marker.bossMeta.hp ?? 0) > (current.bossMeta?.hp ?? 0) ||
      ((marker.bossMeta.hp ?? 0) === (current.bossMeta?.hp ?? 0) && marker.id < current.id)
    ) {
      groups.set(key, marker);
    }
  }

  return [...groups.values()]
    .map((marker) => ({
      marker,
      name: marker.name,
      region: marker.region,
      hp: marker.bossMeta?.hp,
      category: marker.category,
    }))
    .sort(
      (a, b) =>
        rank(a.category) - rank(b.category) ||
        a.name.localeCompare(b.name) ||
        (a.region ?? "").localeCompare(b.region ?? ""),
    );
};

/**
 * Case-, accent- and separator-insensitive (see lib/search-match), so "manbat"
 * finds Man-Bat and "godricks" finds Godrick. A region hit is weaker evidence
 * than any name hit and sorts below all of them.
 */
export const filterCompanionBosses = (
  bosses: CompanionBoss[],
  rawQuery: string,
): CompanionBoss[] => {
  const query = searchQuery(rawQuery);
  if (query.empty) return bosses;

  const collect = (score: (value: string | undefined) => number) => {
    const out: { boss: CompanionBoss; score: number }[] = [];
    for (const boss of bosses) {
      let value = score(boss.name);
      if (value === NO_MATCH) {
        if (score(boss.region) === NO_MATCH) continue;
        value = REGION_SCORE;
      }
      out.push({ boss, score: value });
    }
    return out;
  };

  // Typos only rescue a dead end — see lib/search-match.
  let scored = collect((value) => matchScore(value, query));
  if (scored.length === 0) scored = collect((value) => fuzzyScore(value, query));

  // Ties fall back to the list's own order: bosses above minibosses, then name.
  return scored
    .sort(
      (a, b) =>
        a.score - b.score ||
        rank(a.boss.category) - rank(b.boss.category) ||
        a.boss.name.localeCompare(b.boss.name),
    )
    .map((entry) => entry.boss);
};
