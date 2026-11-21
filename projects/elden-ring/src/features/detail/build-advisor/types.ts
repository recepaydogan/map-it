import type { StatusTier } from "../../../data/combat";
import type { DamageKey, StatKey } from "../../../data/er-ar";
import type { ErItem } from "../../../data/er-items-data";

export type BuildStyle = "balanced" | "damage" | "survival";
export type ProgressionGap = "level" | "vigor" | "upgrade" | "scadutree" | "damage";
export interface ItemAccess {
  available: boolean;
  effort: number;
}
export type ItemAccessResolver = (item: ErItem) => ItemAccess;

export interface BuildStats extends Record<StatKey, number> {
  vig: number;
  mind: number;
  end: number;
}

export interface RecommendedItem {
  item: ErItem;
  reason: string;
  detail?: string;
}

export interface SpellRecommendation extends RecommendedItem {
  catalyst: ErItem;
  damage: number;
  fp: number;
}

export type StanceMoveKey = "light" | "heavy" | "chargedHeavy" | "jumpHeavy" | "guardCounter";

export interface StaggerMove {
  key: StanceMoveKey;
  stanceDamage: number;
  hitsPerAttack: number;
  attacksToBreak: number;
}

export interface StaggerPlan {
  bossStance: number;
  /** The plain R1/RB swing — what the headline figure quotes. It is the move
   *  every player has, on every weapon, with no shield and no setup, so it is
   *  the honest baseline; the faster moves are situational and live one click
   *  away in the comparison. */
  headlineMove: StaggerMove;
  /** Fewest swings to break, whatever it takes to get there. Marks the
   *  recommended cell in the comparison grid. */
  bestMove: StaggerMove;
  moves: StaggerMove[];
}

export interface WeaponRecommendation {
  item: ErItem;
  weaponId: number;
  affinity: string;
  upgrade: number;
  maxUpgrade: number;
  adjustedAr: number;
  fitScore: number;
  directScore: number;
  statusScore: number;
  rawAr: number;
  className: string;
  stats: BuildStats;
  attackTypes: string[];
  buildup: { type: string; value: number; tier: StatusTier }[];
  damageParts: { type: DamageKey; raw: number; adjusted: number; multiplier: number }[];
  primaryDamage: string;
  reason: string;
  profileId: number;
  staggerPlan?: StaggerPlan;
}

export interface ProgressionAssessment {
  status: "meets" | "below";
  confidence: "high" | "estimated";
  levelMin: number;
  levelMax: number;
  targetVigor: number;
  upgradeMin: number;
  upgradeMax: number;
  targetScadutree?: number;
  performanceFloor: number;
  weaponPerformanceRatio: number;
  gaps: ProgressionGap[];
}

export interface BossBuildRecommendation {
  weapon: WeaponRecommendation;
  alternatives: WeaponRecommendation[];
  talismans: RecommendedItem[];
  tears: RecommendedItem[];
  consumables: RecommendedItem[];
  spirit?: RecommendedItem;
  ashOfWar?: RecommendedItem;
  offhand?: RecommendedItem;
  spells: SpellRecommendation[];
  bossCounters: RecommendedItem[];
  defenseFocus: string[];
  equipLoad: { current: number; maximum: number; ratio: number };
  progression: ProgressionAssessment;
  scadutree?: { level: number; attack: number; damageTaken: number };
}
