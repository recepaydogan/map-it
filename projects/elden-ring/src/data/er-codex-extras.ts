import raw from "./generated/er-codex-extras.json";

/**
 * Everything the item DB knew but never said out loud, decoded from the params
 * (data/src/build-er-codex-extras.mjs):
 *
 *  • **What a talisman/tear/consumable actually DOES**, in numbers — `EquipParamAccessory.refId`
 *    / `EquipParamGoods.refId_default` → SpEffectParam, field by field. Radagon's Scarseal
 *    finally admits it: +3 Vigor/Endurance/Strength/Dexterity *and 10% more damage taken*.
 *  • **Ash-of-War FP costs** and the skill's own lore/mechanics text (SwordArtsParam +
 *    ArtsName/ArtsCaption). Lion's Claw: 20 FP.
 *  • **Spirit Ash real stats** — the summon's true HP at every upgrade level, its poise, how
 *    many bodies it puts on the field, and what it costs to call. Mimic Tear +10: 7,808 HP.
 *  • The terse one-line **info** strings (AccessoryInfo / GoodsInfo2 / WeaponInfo /
 *    ProtectorInfo / GemInfo) the builders never read.
 *
 * Keyed by the codex's collision-safe itemKey (`<group>:<id>` — see erItemKey).
 */

/** One decoded line of a SpEffect: what changes, by how much, and whether it's good for you. */
export interface ErEffect {
  label: string;
  value: string;
  kind: "buff" | "debuff";
}

export interface ErItemExtra {
  /** Weapons + Ashes of War: the skill they carry, with its real FP cost. */
  skill?: {
    name: string;
    caption?: string;
    /** FP for the skill itself. */
    fp?: number;
    /** FP for each follow-up input the skill allows. */
    fpFollowUp?: number[];
  };
  /** The game's own one-liner (AccessoryInfo / GoodsInfo2 / WeaponInfo / …). */
  info?: string;
  effects?: ErEffect[];
  /** Non-default SpEffectParam fields retained for data-driven build scoring. */
  metrics?: Record<string, number>;
  /** How long the effect lasts (physick tears, buff consumables). */
  durationSec?: number;
  /** For effects that tick (regen), the interval between ticks. */
  tickSec?: number;
}

/** A Spirit Ash summon: what actually walks onto the field when you spend the FP. */
export interface ErSpirit {
  name: string;
  /** How many bodies the ashes summon (Lone Wolf = 3, Demi-Human = 5). */
  count: number;
  /** True HP per entity at upgrade +0 … +10 (index = level). */
  hp: number[];
  poise: number;
  /** The shared upgrade curve's attack multiplier at each level. */
  attackRate: number[];
  costFp: number | null;
  costHp: number | null;
  /** Per-entity durability when a multi-summon contains different NPC variants. */
  entities?: { hp: number[]; poise: number }[];
}

const data = raw as unknown as {
  patch: string;
  items: Record<string, ErItemExtra>;
  spirits: Record<string, ErSpirit>;
  spiritCurve: { hp: number[]; attack: number[] };
};

/** The extra facts for an item, by its unique codex key (`weapon:2000000`). */
export const erItemExtra = (itemKey: string): ErItemExtra | undefined => data.items[itemKey];

/** The summon behind a Spirit Ash goods item, by its codex key (`goods:207000`). */
export const erSpirit = (itemKey: string): ErSpirit | undefined => data.spirits[itemKey];

/** The one upgrade curve every Spirit Ash shares (SpEffect 290000-290010). */
export const erSpiritCurve = data.spiritCurve;
