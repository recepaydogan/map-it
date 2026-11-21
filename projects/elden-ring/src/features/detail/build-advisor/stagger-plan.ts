import type { WeaponProfile } from "./advisor-data";
import type { StaggerMove, StaggerPlan, StanceMoveKey } from "./types";

const movePriority: Record<StanceMoveKey, number> = {
  chargedHeavy: 5,
  jumpHeavy: 4,
  guardCounter: 3,
  heavy: 2,
  light: 1,
};

export const createStaggerPlan = (
  profile: WeaponProfile,
  bossStance: number | undefined,
  upgrade: number,
  twoHanded: boolean,
): StaggerPlan | undefined => {
  if (!profile.stance || !bossStance || bossStance <= 0) return undefined;

  const sourceMoves = twoHanded ? profile.stance.twoHanded : profile.stance.oneHanded;
  const upgradeRate = profile.stance.upgradeRates?.[upgrade] ?? 1;
  const moves = sourceMoves.flatMap<StaggerMove>((move) => {
    const stanceDamage = move.damage * upgradeRate;
    if (stanceDamage <= 0) return [];
    return [{
      key: move.key,
      stanceDamage,
      hitsPerAttack: move.hits,
      attacksToBreak: Math.ceil(bossStance / stanceDamage),
    }];
  });
  if (!moves.length) return undefined;

  const bestMove = [...moves].sort((a, b) =>
    a.attacksToBreak - b.attacksToBreak
    || movePriority[b.key] - movePriority[a.key]
    || b.stanceDamage - a.stanceDamage,
  )[0];
  // The headline quotes the plain attack, not the optimum: a guard counter needs
  // a shield and a swing to block first, a jump heavy needs the spacing for it.
  // Those are real answers, but they are not what "how long does this take"
  // means to someone who just walked into the arena.
  const headlineMove = moves.find((move) => move.key === "light") ?? bestMove;
  return { bossStance, headlineMove, bestMove, moves };
};
