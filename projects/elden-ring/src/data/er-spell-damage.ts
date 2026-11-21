import raw from "./generated/er-spell-damage.json";
import type { DamageKey, StatKey } from "./er-ar";

/**
 * Spell damage — the sorcery/incantation analogue of er-ar.ts's weapon Attack Rating.
 *
 * A spell has a fixed base motion value per damage type (from its Bullet → AtkParam chain — e.g.
 * Glintstone Pebble is magic 152). The CATALYST does the scaling: a staff (sorceries) applies its
 * `correctMagic` through Intelligence, a seal (incantations) applies `correctFaith` through Faith,
 * both boosted by the catalyst's upgrade level (ReinforceParamWeapon correct*Rate) and fed through
 * a CalcCorrectGraph soft-cap curve — the SAME machinery er-ar.ts uses for weapons:
 *
 *     final(type) = base(type) × ( 1 + effectiveCoeff/100 × curve(castStat)/100 )
 *     effectiveCoeff = catalyst.correct × reinforce.correct*Rate(at upgrade)
 *
 * HONESTY BAR (matches the build script's report):
 *  • The per-element BASE values are exact (verified against Glintstone Pebble atkMag=152).
 *  • The catalyst multiplier reuses the weapon-AR coefficient×reinforce×curve machinery with a
 *    phantom base of 100. It reproduces the clean anchor (at +0 / requirement stat the multiplier
 *    is ~1.0, so a spell hits for ≈ its base) and the correct growth shape, but the ABSOLUTE
 *    high-upgrade total can run somewhat above the in-game "Sorcery/Incantation Scaling" figure,
 *    because the true catalyst spellbuff normalisation can't be pinned without a canonical anchor.
 *    Treat the total as the base × a faithful scaling factor, not a to-the-point in-game readout.
 *  • Multi-hit / AoE spells (damage buried in child bullets, or numShoot>1) carry `multiHit`: the
 *    UI shows the per-projectile number (and × hitCount when known) rather than a fabricated sum.
 */

export type CastStat = "int" | "fai";

interface Curve {
  vals: number[];
  grows: number[];
  adjs: number[];
}
interface Catalyst {
  name: string;
  kind: "staff" | "seal";
  castStat: CastStat;
  /** Base sorcery/incantation scaling coefficient (%) — correctMagic (staff) or correctFaith (seal). */
  correct: number;
  /** CalcCorrectGraph id for the castStat → % soft-cap curve. */
  graph: number;
  /** ReinforceParamWeapon type id; rt + level is the row for the upgrade multipliers. */
  rt: number;
  /** Highest upgrade: 25 standard, 10 somber, 0 for the non-upgradable Meteorite Staff. */
  max: number;
  req?: Partial<Record<StatKey, number>>;
}
export interface SpellProfile {
  name: string;
  type: "sorcery" | "incantation";
  fp: number;
  stamina: number;
  slots: number;
  req?: Partial<Record<CastStat | "arc", number>>;
  /** Base damage per element (empty for buff/utility spells with no direct-damage chain). */
  base: Partial<Record<DamageKey, number>>;
  hitCount?: number;
  multiHit: boolean;
}

const data = raw as unknown as {
  graphs: Record<string, Curve>;
  reinforce: Record<string, { cm: number; cf: number }>;
  catalysts: Record<string, Catalyst>;
  spells: Record<string, SpellProfile>;
};

export const DAMAGE_KEYS: DamageKey[] = ["physical", "magic", "fire", "lightning", "holy"];

/** Does this spell have any direct damage to compute (i.e. not a pure buff/utility spell)? */
export const hasSpellDamage = (spellKey: string): boolean => {
  const s = data.spells[spellKey];
  return !!s && Object.keys(s.base).length > 0;
};

/** A spell's school — decides whether staves or seals cast it. */
export const spellType = (spellKey: string): "sorcery" | "incantation" | null =>
  data.spells[spellKey]?.type ?? null;

export interface CatalystOption {
  id: number;
  name: string;
  kind: "staff" | "seal";
  max: number;
  req?: Partial<Record<StatKey, number>>;
}

/** The catalysts that can cast this school — staves for sorceries, seals for incantations. */
export const catalystsFor = (type: "sorcery" | "incantation"): CatalystOption[] => {
  const kind = type === "sorcery" ? "staff" : "seal";
  return Object.entries(data.catalysts)
    .filter(([, c]) => c.kind === kind)
    .map(([id, c]) => ({ id: Number(id), name: c.name, kind: c.kind, max: c.max, req: c.req }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export interface SpellOption extends SpellProfile {
  key: string;
}

/** Every game-file spell profile, including utility spells without a direct-damage chain. */
export const spellOptions = (): SpellOption[] =>
  Object.entries(data.spells).map(([key, spell]) => ({ key, ...spell }));

/** Max upgrade for a catalyst (25 standard / 10 somber / 0 fixed). */
export const catalystMax = (catalystId: number): number => data.catalysts[catalystId]?.max ?? 0;

/**
 * The soft-cap curve: a piecewise interpolation between the 5 (stat → %) anchors, each segment
 * bent by its own exponent. Copied verbatim from er-ar.ts — the same CalcCorrectGraph machinery.
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
    const growth = adj > 0 ? Math.pow(ratio, adj) : 1 - Math.pow(1 - ratio, Math.abs(adj));
    return grows[i] + (grows[i + 1] - grows[i]) * growth;
  }
  return grows[grows.length - 1];
};

export interface SpellDamageResult {
  /** Per-hit total across all damage types (one projectile / one hit of the spell). */
  total: number;
  parts: { type: DamageKey; base: number; scaling: number; total: number }[];
  /** Projectiles / hits per cast (best-effort; 1 when a spell fires once). */
  hitCount: number;
  /** True when the spell is multi-projectile / AoE and a single honest full-cast total isn't derivable. */
  multiHit: boolean;
  /** The catalyst's effective scaling multiplier, as a percentage (100 = spell hits for its base). */
  spellbuff: number;
  /** Which stat the catalyst scales this spell with (int for staves, fai for seals). */
  castStat: CastStat;
  /** Requirements the build does not meet — the game heavily penalises casting these. */
  unmet: { stat: StatKey; need: number; have: number }[];
}

/**
 * What a spell hits for, cast from `catalystId` at upgrade `level`, with the given build.
 * `stats` uses the same short keys as computeAR (str/dex/int/fai/arc). Returns null for a
 * buff/utility spell (no damage) or an incompatible catalyst (seal for a sorcery, etc.).
 */
export const computeSpellDamage = (
  spellKey: string,
  catalystId: number,
  level: number,
  stats: Record<StatKey, number>,
): SpellDamageResult | null => {
  const spell = data.spells[spellKey];
  const cat = data.catalysts[catalystId];
  if (!spell || !cat) return null;
  if (!Object.keys(spell.base).length) return null; // buff / utility — nothing to compute
  // A staff can't cast an incantation, nor a seal a sorcery — an incompatible pairing is invalid.
  if (cat.kind !== (spell.type === "sorcery" ? "staff" : "seal")) return null;

  const lvl = Math.max(0, Math.min(level, cat.max));
  const rate = data.reinforce[String(cat.rt + lvl)] ?? data.reinforce[String(cat.rt)];
  const coeffRate = cat.kind === "staff" ? rate?.cm ?? 1 : rate?.cf ?? 1;
  const effectiveCoeff = cat.correct * coeffRate;

  const castStatVal = stats[cat.castStat] ?? 0;
  const curve = data.graphs[String(cat.graph)];
  const pct = curve ? curveAt(curve, castStatVal) : 0;
  // The fraction added on top of the base — 0 when the stat contributes nothing.
  const factor = (effectiveCoeff / 100) * (pct / 100);

  const parts: SpellDamageResult["parts"] = [];
  for (const type of DAMAGE_KEYS) {
    const base = spell.base[type];
    if (!base) continue;
    const scaling = base * factor;
    parts.push({ type, base, scaling, total: base + scaling });
  }

  const unmet: SpellDamageResult["unmet"] = [];
  for (const [stat, need] of Object.entries(spell.req ?? {}) as [CastStat | "arc", number][]) {
    const have = stats[stat as StatKey] ?? 0;
    if (have < need) unmet.push({ stat, need, have });
  }
  for (const [stat, need] of Object.entries(cat.req ?? {}) as [StatKey, number][]) {
    const have = stats[stat] ?? 0;
    if (have < need && !unmet.some((entry) => entry.stat === stat && entry.need === need)) {
      unmet.push({ stat, need, have });
    }
  }

  return {
    total: parts.reduce((a, p) => a + p.total, 0),
    parts,
    hitCount: spell.hitCount ?? 1,
    multiHit: spell.multiHit,
    spellbuff: (1 + factor) * 100,
    castStat: cat.castStat,
    unmet,
  };
};
