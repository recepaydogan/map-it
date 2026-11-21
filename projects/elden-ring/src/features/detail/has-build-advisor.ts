import { NR_BOSS_CATEGORIES } from "../../data/boss-images";
import type { Marker } from "../../data/types";

/**
 * Which markers get the Build tab on their combat page.
 *
 * Every enemy carrying a resistance table gets combat intel, but a full
 * loadout dialled in against a rune level is reserved for the marquee fights
 * only: the boss tiers above plain `boss`, the evergaol duels and NPC
 * invasions. Plain bosses, minibosses, elites and ordinary enemies keep the
 * intel page without a Build tab. (The in-game companion boss list has its own
 * gate — companion-boss-list.ts — and is deliberately NOT narrowed by this.)
 */
const BUILD_CATEGORIES = new Set(["great-boss", "legendary-boss", "evergaol-boss", "invasion"]);

export const hasBuildAdvisor = (marker: Pick<Marker, "category">): boolean =>
  BUILD_CATEGORIES.has(marker.category) || NR_BOSS_CATEGORIES.has(marker.category);
