import type { TFunction } from "i18next";
import { Coins, FlaskConical, Gem, Package, Sparkles, Swords, Wand2, Zap } from "lucide-react";
import { nrWeapons, type NrWeapon } from "../../data/nightreign-data";
import {
  type NrBoon,
  type NrGood,
  type NrShopEntry,
  type NrSkill,
  type NrSpell,
  type NrTalisman,
  nrBoons,
  nrGoods,
  nrRarityIndex,
  nrShop,
  nrSkills,
  nrSpells,
  nrTalismans,
} from "../../data/nr-codex-data";
import { nrLootPools } from "../../data/nr-loot-data";
import { lootPage } from "./nr-loot";

export const RARITY_COLORS = ["#a1a1aa", "#60a5fa", "#c084fc", "#3fd6e0"];
export const rarityColor = (r?: number) => RARITY_COLORS[r ?? 0] ?? RARITY_COLORS[0];

export const STATUS_COLOR: Record<string, string> = {
  "Blood loss": "#dc2626",
  Poison: "#84cc16",
  "Scarlet Rot": "#f43f5e",
  Frostbite: "#7dd3fc",
  Sleep: "#a78bfa",
  Madness: "#eab308",
};
const STAT_COLOR: Record<string, string> = {
  Strength: "#fb923c",
  Dexterity: "#a3e635",
  Intelligence: "#22d3ee",
  Faith: "#fde68a",
};
const DMG_LABEL: Record<string, string> = {
  physical: "Phys",
  magic: "Magic",
  fire: "Fire",
  lightning: "Light",
  holy: "Holy",
};

/**
 * The one shape every archive page renders. Each category adapts its own rows into this,
 * so the search, results, and detail frame are written once — and a new category
 * is an adapter, not another browser.
 */
export interface Page {
  key: string;
  name: string;
  /** The line above the name in the detail view. */
  sub?: string;
  type?: string;
  iconId?: number | null;
  rarity?: number;
  /** Small coloured pills under the title on the detail page. */
  chips?: { label: string; color?: string }[];
  /** The game's own prose — caption first, then the terse one-line info. */
  body?: string;
  info?: string;
  /** Number blocks, rendered as labelled columns. */
  blocks?: { title: string; rows: { label: string; value: string; color?: string }[] }[];
  /** Free-text sections (skill description, upgrade tiers, …). */
  notes?: { title: string; lines: string[] }[];
  /** A marker for a weapon's innate status. */
  dot?: string;
  /** Searchable text beyond the name. */
  hay?: string;
}

export function nightreignArchiveSections(t: TFunction) {
  const weaponPage = (w: NrWeapon): Page => ({
    key: `w${w.id}`,
    name: w.name,
    type: w.type,
    sub: `${w.rarityLabel} · ${w.type}`,
    iconId: w.icon,
    rarity: w.rarity,
    dot: w.passives?.[0]?.type,
    hay: `${w.type} ${w.skill?.name ?? ""}`,
    chips: [
      ...(w.passives ?? []).map((p) => ({ label: `${p.type} ${p.value}`, color: STATUS_COLOR[p.type] })),
      ...(w.hero ? [{ label: t("nightreign.weaponHero", { hero: w.hero }) }] : []),
    ],
    body: w.caption,
    blocks: [
      {
        title: t("nightreign.weaponAttack"),
        rows: Object.entries(w.damage).map(([k, v]) => ({
          label: DMG_LABEL[k] ?? k,
          value: String(v),
        })),
      },
      {
        title: t("nightreign.weaponScaling"),
        rows: Object.entries(w.scaling).map(([s, v]) => ({
          label: t(`stat.${s}`, { defaultValue: s }),
          value: String(v),
          color: STAT_COLOR[s],
        })),
      },
    ],
    notes: [
      ...(w.skill
        ? [
            {
              title: t("nightreign.weaponSkill"),
              lines: [
                [w.skill.name, w.skill.fp ? `· ${t("nightreign.skillFp", { fp: w.skill.fp })}` : ""]
                  .filter(Boolean)
                  .join(" "),
                ...(w.skill.desc ? [w.skill.desc] : []),
              ],
            },
          ]
        : []),
      ...(w.affinities?.length
        ? [{ title: t("nightreign.weaponAffinities"), lines: [w.affinities.join(" · ")] }]
        : []),
    ],
  });

  const skillPage = (s: NrSkill): Page => ({
    key: `s${s.id}`,
    name: s.name,
    sub: s.startSkillFor?.length
      ? t("nightreign.starterFor", { heroes: s.startSkillFor.join(", ") })
      : t("nightreign.catSkills"),
    iconId: s.iconId,
    hay: s.startSkillFor?.join(" ") ?? "",
    chips: [
      ...(s.fp ? [{ label: t("nightreign.skillFp", { fp: s.fp }), color: "#60a5fa" }] : []),
      ...(s.fpFollowUp ?? []).map((fp) => ({ label: `↳ ${t("nightreign.skillFp", { fp })}` })),
    ],
    info: s.info,
    body: s.caption,
  });

  const spellPage = (s: NrSpell): Page => ({
    key: `m${s.id}`,
    name: s.name,
    sub: t("nightreign.catSpells"),
    iconId: s.iconId,
    chips: [
      ...(s.fp ? [{ label: t("nightreign.skillFp", { fp: s.fp }), color: "#60a5fa" }] : []),
      ...(s.stamina ? [{ label: t("nightreign.spellStamina", { stamina: s.stamina }) }] : []),
    ],
    info: s.info,
    body: s.caption,
  });

  const goodPage = (g: NrGood): Page => ({
    key: `g${g.id}`,
    name: g.name,
    type: g.category,
    sub: [g.rarityLabel, g.category].filter(Boolean).join(" · "),
    iconId: g.iconId,
    rarity: nrRarityIndex(g.rarityLabel),
    info: g.info,
    body: g.caption,
    notes: g.tiers?.length
      ? [
          {
            // Tiers point at a SpEffect (with text) or a Bullet (ref only) — show what we have.
            title: t("nightreign.itemTiers"),
            lines: g.tiers.map(
              (tr) => `+${tr.level} — ${tr.effect ?? tr.name ?? t("nightreign.tierRef", { type: tr.refType })}`,
            ),
          },
        ]
      : undefined,
  });

  const talismanPage = (a: NrTalisman): Page => ({
    key: `a${a.id}`,
    name: a.name,
    sub: a.rarityLabel,
    iconId: a.iconId,
    rarity: nrRarityIndex(a.rarityLabel),
    info: a.info,
    body: a.caption,
    // The decoded numbers first (they're the load-bearing part — a talisman "raises damage
    // negation" reads very differently from "×0.6 damage taken"), then the game's own text.
    blocks: a.stats?.length
      ? [
          {
            title: t("codex.section.effect"),
            rows: a.stats.map((st) => ({
              label: st.stat,
              value:
                st.kind === "multiplier"
                  ? `×${st.value}`
                  : st.kind === "percent"
                    ? `${st.value > 0 ? "+" : ""}${st.value}%`
                    : `${st.value > 0 ? "+" : ""}${st.value}`,
            })),
          },
        ]
      : undefined,
    notes: a.effects?.length
      ? [{ title: t("codex.section.effect"), lines: a.effects.map((e) => e.name) }]
      : undefined,
  });

  const boonPage = (b: NrBoon): Page => ({
    key: `b${b.id}`,
    name: b.name,
    sub:
      b.kind === "curse"
        ? t("nightreign.boonCurse")
        : b.kind === "blessing"
          ? t("nightreign.boonBlessing")
          : t("nightreign.catBoons"),
    iconId: b.iconId,
    info: b.info,
    body: b.caption,
  });

  const shopPage = (s: NrShopEntry): Page => ({
    key: `p${s.id}`,
    name: s.name,
    sub:
      s.currency === "murk"
        ? t("nightreign.priceMurk", { price: s.price })
        : t("nightreign.priceSigil", { price: s.price, count: s.price }),
    iconId: s.iconId,
    rarity: s.rarityLabel ? nrRarityIndex(s.rarityLabel) : undefined,
    hay: s.currency,
    chips: [
      {
        label:
          s.currency === "murk"
            ? t("nightreign.priceMurk", { price: s.price })
            : t("nightreign.priceSigil", { price: s.price, count: s.price }),
        color: s.currency === "murk" ? "#a78bfa" : "#fbbf24",
      },
    ],
  });

  return [
    { id: "weapons", label: t("nightreign.catWeapons"), icon: Swords, pages: nrWeapons.map(weaponPage) },
    { id: "skills", label: t("nightreign.catSkills"), icon: Zap, pages: nrSkills.map(skillPage) },
    { id: "spells", label: t("nightreign.catSpells"), icon: Wand2, pages: nrSpells.map(spellPage) },
    { id: "items", label: t("nightreign.catItems"), icon: FlaskConical, pages: nrGoods.map(goodPage) },
    { id: "talismans", label: t("nightreign.catTalismans"), icon: Gem, pages: nrTalismans.map(talismanPage) },
    { id: "boons", label: t("nightreign.catBoons"), icon: Sparkles, pages: nrBoons.map(boonPage) },
    { id: "shop", label: t("nightreign.catShop"), icon: Coins, pages: nrShop.map(shopPage) },
    { id: "loot", label: t("nightreign.catLoot"), icon: Package, pages: nrLootPools.map(pool => lootPage(pool, t)) },
  ];
}
