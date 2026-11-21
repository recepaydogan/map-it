import type { Combat } from "../../../data/combat";
import type { WeaponRecommendation } from "./types";

const PHYSICAL_DAMAGE_TYPES = new Set(["standard", "slash", "strike", "pierce"]);

export interface PrimaryDamageOpportunity {
  types: Set<string>;
  multiplier: number;
  meaningful: boolean;
}

export const primaryDamageOpportunity = (combat: Combat): PrimaryDamageOpportunity => {
  const ranked = [...combat.damage].sort((a, b) => b.mult - a.mult);
  const strongest = ranked[0];
  if (!strongest) return { types: new Set(), multiplier: 1, meaningful: false };

  const strongestTypes = ranked.filter((entry) => strongest.mult - entry.mult <= 0.01);
  const nextBest = ranked.find((entry) => strongest.mult - entry.mult > 0.01);
  const relativeLead = nextBest ? strongest.mult / Math.max(0.01, nextBest.mult) : 1;
  return {
    types: new Set(strongestTypes.map((entry) => entry.type.toLowerCase())),
    multiplier: strongest.mult,
    meaningful: strongest.mult >= 1.1 || relativeLead >= 1.08,
  };
};

export const consistentlyExploitsDamageOpportunity = (
  weapon: WeaponRecommendation,
  opportunity: PrimaryDamageOpportunity,
): boolean => {
  if (!opportunity.meaningful) return true;

  const physicalTypes = [...opportunity.types].filter((type) => PHYSICAL_DAMAGE_TYPES.has(type));
  const exploitsPhysical = physicalTypes.length > 0
    && weapon.attackTypes.length > 0
    && weapon.attackTypes.every((type) => opportunity.types.has(type.toLowerCase()));
  const strongestAdjustedPart = [...weapon.damageParts].sort((a, b) => b.adjusted - a.adjusted)[0];
  const exploitsElemental = strongestAdjustedPart != null
    && !PHYSICAL_DAMAGE_TYPES.has(strongestAdjustedPart.type.toLowerCase())
    && opportunity.types.has(strongestAdjustedPart.type.toLowerCase());
  return exploitsPhysical || exploitsElemental;
};

export const bossDamageMultiplier = (
  combat: Combat,
  damageType: string,
  attackTypes: string[],
): number => {
  if (damageType.toLowerCase() !== "physical") {
    return combat.damage.find((entry) => entry.type.toLowerCase() === damageType.toLowerCase())?.mult ?? 1;
  }
  const matches = attackTypes
    .map((type) => combat.damage.find((entry) => entry.type === type)?.mult)
    .filter((value): value is number => value != null);
  // EquipParamWeapon exposes supported physical attack types, not per-move
  // frequencies. Average mixed movesets so a secondary thrust does not make
  // every hit count as Pierce, while pure-type weapons retain their full edge.
  if (matches.length) return matches.reduce((sum, value) => sum + value, 0) / matches.length;
  return combat.damage.find((entry) => entry.type === "Physical")?.mult ?? 1;
};
