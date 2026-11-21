import type { Combat, StatusTier } from "../../../data/combat";
import type { BuildStyle } from "./types";

const DIRECT_THROUGHPUT: Record<string, number> = {
  Dagger: 1.08,
  "Straight Sword": 1.04,
  "Curved Sword": 1.05,
  "Thrusting Sword": 1.05,
  "Backhand Blade": 1.07,
  Fist: 1.06,
  Claw: 1.06,
  "Beast Claw": 1.06,
  "Hand-to-Hand": 1.06,
  Twinblade: 1.04,
  Katana: 1.04,
  Axe: 1,
  Hammer: 1,
  Spear: 1.03,
  Flail: 1,
  Whip: 1.02,
  Reaper: 1,
  Halberd: 0.98,
  Greatsword: 0.96,
  "Curved Greatsword": 0.97,
  Greataxe: 0.95,
  "Great Hammer": 0.94,
  "Great Spear": 0.96,
  "Heavy Thrusting Sword": 0.98,
  "Great Katana": 0.99,
  "Light Greatsword": 1.03,
  "Colossal Sword": 0.92,
  "Colossal Weapon": 0.9,
};

const STATUS_VALUE: Record<string, number> = {
  Bleed: 0.13,
  Frostbite: 0.11,
  "Scarlet Rot": 0.09,
  Poison: 0.05,
  Sleep: 0.04,
  Madness: 0.02,
};

const TIER_WEIGHT: Record<StatusTier, number> = {
  effective: 1,
  moderate: 0.6,
  resistant: 0.18,
  immune: 0,
};

const STYLE_STATUS_WEIGHT: Record<BuildStyle, number> = {
  damage: 0.75,
  balanced: 1,
  survival: 0.9,
};

const DIMINISHING_STATUS_RETURNS = [1, 0.5, 0.25];
const MAX_STATUS_SHARE = 0.16;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const statusTier = (combat: Combat, type: string): StatusTier =>
  combat.status.find((entry) => entry.type === type)?.tier ?? "immune";

export const statusTierWeight = (combat: Combat, type: string): number =>
  TIER_WEIGHT[statusTier(combat, type)];

const healthValue = (bossHp: number | undefined): number => {
  if (!bossHp || bossHp <= 0) return 1;
  return clamp(0.85 + Math.log10(Math.max(1, bossHp / 1_000)) * 0.1, 0.85, 1.15);
};

const statusPotential = (
  type: string,
  buildup: number,
  combat: Combat,
  subtype: string | undefined,
  bossHp: number | undefined,
): number => {
  const value = STATUS_VALUE[type] ?? 0;
  const tier = statusTierWeight(combat, type);
  if (!value || !tier || buildup <= 0) return 0;
  const delivery = 1 - Math.exp(-buildup / 110);
  const cadence = clamp(DIRECT_THROUGHPUT[subtype ?? ""] ?? 1, 0.85, 1.12);
  return value * tier * delivery * cadence * healthValue(bossHp);
};

export interface WeaponFitScore {
  direct: number;
  status: number;
  total: number;
  statusShare: number;
}

export const scoreWeaponFit = ({
  adjustedAr,
  buildup,
  combat,
  subtype,
  bossHp,
  style,
  damageChannels = 1,
}: {
  adjustedAr: number;
  buildup: { type: string; value: number }[];
  combat: Combat;
  subtype?: string;
  bossHp?: number;
  style: BuildStyle;
  damageChannels?: number;
}): WeaponFitScore => {
  const splitDefenseFactor = damageChannels <= 1 ? 1 : damageChannels === 2 ? 0.88 : 0.8;
  const direct = adjustedAr * (DIRECT_THROUGHPUT[subtype ?? ""] ?? 1) * splitDefenseFactor;
  const potentials = buildup
    .map((entry) => statusPotential(entry.type, entry.value, combat, subtype, bossHp))
    .filter((value) => value > 0)
    .sort((a, b) => b - a);
  const statusRatio = clamp(
    potentials.reduce(
      (sum, value, index) => sum + value * (DIMINISHING_STATUS_RETURNS[index] ?? 0),
      0,
    ) * STYLE_STATUS_WEIGHT[style],
    0,
    MAX_STATUS_SHARE,
  );
  const status = direct * statusRatio;
  return { direct, status, total: direct + status, statusShare: statusRatio };
};
