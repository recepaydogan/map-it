import raw from "./generated/nr-codex.json";

/**
 * The rest of the Nightreign codex, straight from the game's params + the English FMG
 * bundles (data/src/build-nr-codex.mjs): every skill with its real FP cost, every spell,
 * the consumables and their upgrade tiers, the talismans with their decoded effects, the
 * expedition boons/curses, and the persistent murk/sigil shop.
 *
 * A few Nightreign-specific truths this data taught us, worth stating so the UI honours them:
 *  • Spells have NO stat requirements — NR removed them. So there's nothing to render there.
 *  • A skill can be the starting skill of SEVERAL heroes (`startSkillFor` is a list).
 *  • Item/talisman rarity is NOT a clean 0-3 in these tables; the `rarityLabel` is the truth,
 *    so colours are derived from the label, not the number.
 *  • Talisman effects come in two forms: the game's own effect TEXT (`effects`) and, where a
 *    field is self-evident, a decoded numeric row (`stats`, raw multipliers — never invented
 *    letter grades).
 */

export interface NrSkill {
  id: number;
  name: string;
  caption?: string;
  info?: string;
  fp?: number;
  fpFollowUp?: number[];
  iconId?: number | null;
  /** The Nightfarers this is a starting skill for (may be several). */
  startSkillFor?: string[];
}

export interface NrSpell {
  id: number;
  name: string;
  caption?: string;
  info?: string;
  fp?: number;
  stamina?: number;
  iconId?: number | null;
}

/** An upgrade tier of a consumable — NR points these at a SpEffect or a Bullet, never a
 *  named item, so a tier carries its ref + (for SpEffect tiers) the official effect text. */
export interface NrItemTier {
  level: number;
  refType: "speffect" | "bullet";
  refId: number;
  name?: string;
  effect?: string;
}

export interface NrGood {
  id: number;
  name: string;
  caption?: string;
  info?: string;
  rarity: number;
  rarityLabel: string;
  iconId?: number | null;
  goodsType?: number;
  category?: string;
  maxHeld?: number;
  tiers?: NrItemTier[];
}

/** A decoded talisman stat: the field, its raw value, and how to read it. */
export interface NrTalismanStat {
  stat: string;
  value: number;
  kind: "multiplier" | "add" | "percent";
}

export interface NrTalisman {
  id: number;
  name: string;
  caption?: string;
  info?: string;
  rarity: number;
  rarityLabel: string;
  iconId?: number | null;
  /** The game's own effect text (SpEffectName / SpEffectInfo). */
  effects?: { name: string; info?: string }[];
  /** Self-evident decoded numbers, where the field was unambiguous. */
  stats?: NrTalismanStat[];
}

export interface NrBoon {
  id: number;
  name: string;
  info?: string;
  caption?: string;
  iconId?: number | null;
  kind?: "boon" | "blessing" | "curse";
}

export interface NrShopEntry {
  id: number;
  currency: "murk" | "sigil";
  price: number;
  equipType?: number;
  equipId?: number;
  name: string;
  iconId?: number | null;
  rarity?: number;
  rarityLabel?: string;
}

export interface NrDropIns {
  shiftingEarth: { id: number; name: string; note?: string }[];
  heroHints: { id: number; hero?: string; text: string }[];
  deepOfNightRewards: { rank: number; itemLotIds: number[]; rewardsResolved?: boolean }[];
}

const data = raw as unknown as {
  patch: string;
  skills: NrSkill[];
  spells: NrSpell[];
  items: NrGood[];
  talismans: NrTalisman[];
  boons: NrBoon[];
  shop: NrShopEntry[];
  dropIns: NrDropIns;
};

/** NR's item-rarity index (0-3) derived from the reliable label — the numeric `rarity`
 *  field in these tables isn't a clean 0-3, but the label always is. */
const RARITY_INDEX: Record<string, number> = { Common: 0, Rare: 1, Epic: 2, Legendary: 3 };
export const nrRarityIndex = (label?: string, fallback = 0): number =>
  label && label in RARITY_INDEX ? RARITY_INDEX[label] : fallback;

/** Skills, minus the hidden-skill placeholder ("???", the "change to reveal" stand-in). */
export const nrSkills: NrSkill[] = data.skills.filter((s) => s.name && s.name !== "???");
export const nrSpells: NrSpell[] = data.spells;
export const nrGoods: NrGood[] = data.items;
export const nrTalismans: NrTalisman[] = data.talismans;
export const nrBoons: NrBoon[] = data.boons;
export const nrShop: NrShopEntry[] = data.shop;
export const nrDropIns: NrDropIns = data.dropIns;
