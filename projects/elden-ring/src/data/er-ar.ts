import raw from "./generated/er-scaling.json";

/**
 * Attack Rating — the number on the game's own equipment screen.
 *
 * AR per damage type = base × upgradeRate + Σ over the stats that scale it:
 *     base × upgradeRate × (coefficient/100) × (softcapCurve(stat)/100)
 *
 * Every input is the game's own: EquipParamWeapon (base damage, coefficients, which curve),
 * ReinforceParamWeapon (the +N multipliers), CalcCorrectGraph (the soft-cap curves) and
 * AttackElementCorrectParam (which stat feeds which damage type). See data/src/build-er-scaling.mjs.
 */

export type StatKey = "str" | "dex" | "int" | "fai" | "arc";
export type DamageKey = "physical" | "magic" | "fire" | "lightning" | "holy";

interface Curve {
  vals: number[];
  grows: number[];
  adjs: number[];
}
interface WeaponScaling {
  base: Partial<Record<DamageKey, number>>;
  corr: Partial<Record<StatKey, number>>;
  req?: Partial<Record<StatKey, number>>;
  graph: Partial<Record<DamageKey, number>>;
  rt: number;
  aec: number;
  /** Highest upgrade level: 25 for standard weapons, 10 for somber ones, 0 for un-upgradable. */
  max: number;
}

const data = raw as unknown as {
  graphs: Record<string, Curve>;
  reinforce: Record<string, { atk: Record<DamageKey, number>; corr: Record<StatKey, number> }>;
  aec: Record<string, Partial<Record<DamageKey, Partial<Record<StatKey, number | null>>>>>;
  weapons: Record<string, WeaponScaling>;
};

export const DAMAGE_KEYS: DamageKey[] = ["physical", "magic", "fire", "lightning", "holy"];
export const STAT_KEYS: StatKey[] = ["str", "dex", "int", "fai", "arc"];

/** Does this weapon have AR data (i.e. is it a real armament)? */
export const hasScaling = (weaponId: number): boolean => !!data.weapons[weaponId];

/** Max upgrade level (25 standard / 10 somber). */
export const maxUpgrade = (weaponId: number): number => data.weapons[weaponId]?.max ?? 0;

/** The weapon's stat requirements (unmet ones cripple damage in-game). */
export const requirements = (weaponId: number): Partial<Record<StatKey, number>> =>
  data.weapons[weaponId]?.req ?? {};

/**
 * The soft-cap curve: a piecewise interpolation between 5 (stat → %) anchors, where each segment
 * bends by its own exponent — this is what makes 40 a soft cap and 80+ nearly flat.
 */
const curveAt = (curve: Curve, stat: number): number => {
  const { vals, grows, adjs } = curve;
  const clamped = Math.max(vals[0], Math.min(stat, vals[vals.length - 1]));
  for (let i = 0; i < vals.length - 1; i++) {
    const lo = vals[i];
    const hi = vals[i + 1];
    if (clamped > hi) continue;
    const span = hi - lo;
    const ratio = span > 0 ? (clamped - lo) / span : 0;
    const adj = adjs[i] || 1;
    // A positive exponent curves the growth up (slow then fast); a negative one is the mirror
    // image (fast then slow) — the game stores it as a sign, not two fields.
    const growth = adj > 0 ? Math.pow(ratio, adj) : 1 - Math.pow(1 - ratio, Math.abs(adj));
    return grows[i] + (grows[i + 1] - grows[i]) * growth;
  }
  return grows[grows.length - 1];
};

export interface ArResult {
  total: number;
  /** Per damage type: what the base contributes and what the stats add. */
  parts: { type: DamageKey; base: number; scaling: number; total: number }[];
  /** Which stats actually feed this weapon's damage (for the UI to highlight). */
  scalingStats: StatKey[];
  /** Requirements the build does not meet — the game heavily penalises these. */
  unmet: { stat: StatKey; need: number; have: number }[];
}

/**
 * AR for a weapon at an upgrade level with a given build.
 * `twoHanded` applies the game's 1.5× Strength bonus (capped at 99).
 */
export const computeAR = (
  weaponId: number,
  level: number,
  stats: Record<StatKey, number>,
  twoHanded = false,
): ArResult | null => {
  const w = data.weapons[weaponId];
  if (!w) return null;

  const lvl = Math.max(0, Math.min(level, w.max));
  const rein = data.reinforce[String(w.rt + lvl)] ?? data.reinforce[String(w.rt)];
  const table = data.aec[String(w.aec)] ?? {};

  const effective: Record<StatKey, number> = { ...stats };
  if (twoHanded) effective.str = Math.min(99, Math.floor(stats.str * 1.5));

  const parts: ArResult["parts"] = [];
  const scalingStats = new Set<StatKey>();

  for (const type of DAMAGE_KEYS) {
    const raw0 = w.base[type];
    if (!raw0) continue;
    const base = raw0 * (rein?.atk[type] ?? 1);
    const curve = data.graphs[String(w.graph[type] ?? 0)];
    let scaling = 0;

    for (const [stat, overwrite] of Object.entries(table[type] ?? {}) as [StatKey, number | null][]) {
      // The element table may overwrite the weapon's own coefficient for this damage type.
      const coeff = (overwrite ?? w.corr[stat] ?? 0) * (rein?.corr[stat] ?? 1);
      if (!coeff) continue;
      const pct = curve ? curveAt(curve, effective[stat] ?? 0) : 0;
      scaling += base * (coeff / 100) * (pct / 100);
      scalingStats.add(stat);
    }
    parts.push({ type, base, scaling, total: base + scaling });
  }

  const unmet: ArResult["unmet"] = [];
  for (const [stat, need] of Object.entries(w.req ?? {}) as [StatKey, number][]) {
    // The 2H Strength bonus counts toward the requirement, exactly as in-game.
    const have = effective[stat] ?? 0;
    if (have < need) unmet.push({ stat, need, have });
  }

  return {
    total: parts.reduce((a, p) => a + p.total, 0),
    parts,
    scalingStats: [...scalingStats],
    unmet,
  };
};
