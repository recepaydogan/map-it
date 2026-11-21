import type { Combat } from "../../../data/combat";
import { consistentlyExploitsDamageOpportunity, primaryDamageOpportunity } from "./boss-profile";
import type { WeaponRecommendation } from "./types";

// Differences inside this band are smaller than the model's missing
// animation/opening data, so matchup evidence decides between near-equal builds.
export const MATCHUP_PERFORMANCE_FLOOR = 0.92;

const WEAKNESS_MATCH_BONUS = 0.07;
const STAGGER_MATCH_BONUS = 0.03;

export const rankBossWeaponCandidates = (
  candidates: WeaponRecommendation[],
  combat: Combat,
): WeaponRecommendation[] => {
  const bestFit = Math.max(...candidates.map((entry) => entry.fitScore));
  if (!Number.isFinite(bestFit)) return [];

  const damageOpportunity = primaryDamageOpportunity(combat);
  const matchupCandidates = candidates.filter(
    (entry) => entry.fitScore >= bestFit * MATCHUP_PERFORMANCE_FLOOR,
  );
  const bestHeadlineStagger = Math.min(
    ...matchupCandidates
      .map((entry) => entry.staggerPlan?.headlineMove.attacksToBreak)
      .filter((value): value is number => value != null),
  );
  const matchupScore = (entry: WeaponRecommendation): number => {
    // The AR score already contains the raw multiplier. This tactical bonus is
    // for applying the best channel consistently across the weapon's moveset,
    // which mixed attack-type averages cannot express on their own.
    const weakness = damageOpportunity.meaningful
      && consistentlyExploitsDamageOpportunity(entry, damageOpportunity)
      ? WEAKNESS_MATCH_BONUS
      : 0;
    const attacksToBreak = entry.staggerPlan?.headlineMove.attacksToBreak;
    const stagger = Number.isFinite(bestHeadlineStagger) && attacksToBreak
      ? bestHeadlineStagger / attacksToBreak * STAGGER_MATCH_BONUS
      : 0;
    return entry.fitScore / bestFit + weakness + stagger;
  };

  return [...candidates].sort((a, b) => {
    const aIsMatchupCandidate = a.fitScore >= bestFit * MATCHUP_PERFORMANCE_FLOOR;
    const bIsMatchupCandidate = b.fitScore >= bestFit * MATCHUP_PERFORMANCE_FLOOR;
    if (aIsMatchupCandidate !== bIsMatchupCandidate) return aIsMatchupCandidate ? -1 : 1;
    return aIsMatchupCandidate
      ? matchupScore(b) - matchupScore(a) || b.fitScore - a.fitScore
      : b.fitScore - a.fitScore;
  });
};
