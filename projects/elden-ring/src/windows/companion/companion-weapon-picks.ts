import type { Combat } from "../../data/combat";
import type { WeaponRecommendation } from "../../features/detail/build-advisor/types";
import { recommendWeapons } from "../../features/detail/build-advisor/weapon-optimizer";

/**
 * Weapons worth a look, for the Find tab's opening screen.
 *
 * These are NOT a hand-picked "meta" list — nothing in this app claims to know
 * what the community rates. They come from the Build Advisor's own optimizer,
 * run against a NEUTRAL target: every damage type at ×1, every status at the
 * middle tier. So the ranking answers a defensible question — "which weapons hit
 * hardest when the enemy has no weakness to exploit" — instead of pretending to
 * rank fights we haven't been given.
 *
 * The reference build is the advisor's own default (rune level 100, balanced,
 * two-handed, upgraded as far as that level allows), so a weapon shown here and
 * the same weapon on a boss page are scored by the same yardstick.
 */
const NEUTRAL_COMBAT: Combat = {
  damage: ["Standard", "Slash", "Strike", "Pierce", "Magic", "Fire", "Lightning", "Holy"].map(
    (type) => ({ type, mult: 1 }),
  ),
  status: ["Bleed", "Frostbite", "Poison", "Scarlet Rot", "Sleep"].map((type) => ({
    type,
    tier: "moderate" as const,
  })),
};

export const PICKS_REFERENCE_LEVEL = 100;

/** Nothing is gated here: the picks are a browse list, not a plan against a
 *  boss, so a weapon deep in the DLC is as valid a suggestion as a starter. */
const OPEN_ACCESS = () => ({ available: true, effort: 0 });

let cached: WeaponRecommendation[] | null = null;

/**
 * Top picks, computed once per session (the optimizer walks every weapon profile
 * and affinity, so it isn't free). Item TEXT is deliberately re-resolved by the
 * caller: the objects captured here keep the language they were built in.
 */
export const companionWeaponPicks = (count: number): WeaponRecommendation[] => {
  cached ??= recommendWeapons(
    NEUTRAL_COMBAT,
    PICKS_REFERENCE_LEVEL,
    "balanced",
    true,
    OPEN_ACCESS,
  );
  return cached.slice(0, count);
};
