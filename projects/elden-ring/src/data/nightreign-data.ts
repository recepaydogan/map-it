import raw from "./generated/nightreign.json";
import type { Marker } from "./types";

/**
 * Real Nightreign data, built from the MIT NikVince dataset by
 * data/src/build-nightreign.mjs. 320 patterns + fixed static POIs, coordinates
 * already in our NOMINAL space.
 */
interface RawMarker {
  id: string;
  category: string;
  name: string;
  region?: string;
  x: number;
  y: number;
  seeded: boolean;
  day?: 1 | 2;
  icon?: string;
  bossMeta?: Marker["bossMeta"];
  description?: string;
}
/** The expedition's Nightlord detail (boss form, elemental weakness, lore, and —
 * where the chr-join lands on the real boss row — full HP/poise + resistance table). */
export interface NightlordMeta {
  bossForm: string | null;
  weakness: string[];
  description: string | null;
  iconId?: number;
  dlc?: boolean;
  hp?: number;
  poise?: number;
  combat?: NonNullable<NonNullable<Marker["bossMeta"]>["combat"]>;
}
/** A playable Nightfarer (Hero): starting build + full ability kit, from HeroParam. */
export interface NightfarerAbility {
  name: string | null;
  summary: string | null;
  description: string | null;
  iconId: number;
  cooldown?: number | null;
  uses?: number | null;
}
export interface Nightfarer {
  id: number;
  name: string;
  portraitId: number;
  smallPortraitId: number;
  lore: string | null;
  /** Starting (Lv 1) attributes. */
  stats: Record<string, number>;
  /** Lv-15 ceiling per attribute (HeroStatusParam). Arcane is fixed → equals `stats.Arcane`. */
  maxStats: Record<string, number>;
  /** The 4 real HeroStatusParam level anchors (keys "1"/"2"/"12"/"15"); levels between are
   *  interpolated. Exact game data at the anchors. */
  statLevels: Record<string, Record<string, number>>;
  skill: NightfarerAbility;
  ultimateArt: NightfarerAbility;
  passive: NightfarerAbility;
}

export interface NightreignPattern {
  layout: number;
  nightlord: string;
  nightlordMeta?: NightlordMeta;
  shiftingEarth: string;
  spawn: string;
  night1Boss: string;
  night2Boss: string;
  specialEvent: string;
  markers: RawMarker[];
}

/** A single rollable relic effect: its text, in-game buff icon id (statusIconId, may be absent),
 *  and UI category id (see RelicCategory). */
export interface RelicEffect {
  name: string;
  icon: number | null;
  cat: string;
}
/** UI grouping for relic effects (Attributes / Offense / Defense / …). */
export interface RelicCategory {
  id: string;
  label: string;
}
/** A relic colour and its pool of rollable effects (decoded from the Antique attach-effects). */
export interface RelicColor {
  id: number;
  scene: string;
  color: string;
  /** Representative vessel gem icon id (EquipParamAntique.iconId) for this colour. */
  vessel: number | null;
  effects: RelicEffect[];
}
/** A signature "Night of …" deep relic: fixed effect combo tied to a defeated Nightlord. */
export interface DeepRelic {
  id: number;
  name: string;
  color: number;
  /** Vessel gem icon id (EquipParamAntique.iconId). */
  icon: number | null;
  /** The Nightlord this relic dropped from (parsed from lore). */
  nightlord: string | null;
  effects: RelicEffect[];
  lore: string | null;
}

/** One Remembrance timeline node: a journal entry ("j": chapter title + lore body,
 *  optional epilogue illustration id) or a quest objective step ("o"). Nodes are stored
 *  in play order, exactly as PersonalScenarioParam sequences them. */
export type RemembranceNode =
  | { t: "j"; title: string; body: string; image?: number }
  | { t: "o"; text: string };

export interface HeroRemembrance {
  heroId: number;
  hero: string;
  nodes: RemembranceNode[];
}

// The guide page shape is shared with the Elden Ring knowledge base (same overlay renders both).
import type { GuideCategory } from "./guide-types";
export type { GuideEntry, GuideCategory } from "./guide-types";

/** One armament in the Nightreign armoury (EquipParamWeapon + its FMG text/icon). Affinity
 *  variants are folded into their base weapon — `affinities` lists which ones it can roll. */
export interface NrWeapon {
  id: number;
  name: string;
  /** 0-3 = the game's Common/Rare/Epic/Legendary item colours. */
  rarity: number;
  rarityLabel: string;
  type: string;
  icon: number;
  /** Only the non-zero channels: physical/magic/fire/lightning/holy. */
  damage: Record<string, number>;
  /** Raw correct* values (NR's own range — NOT Elden Ring letter grades). */
  scaling: Record<string, number>;
  caption?: string;
  /** Status buildup applied on hit, straight from the weapon's innate SpEffect. */
  passives?: { type: string; value: number }[];
  skill?: { name: string; fp?: number; desc?: string };
  /** True when the weapon always carries that skill (the signature armaments). */
  fixedSkill?: boolean;
  affinities?: string[];
  /** The Nightfarer whose weapon proficiency this armament belongs to. */
  hero?: string;
  ultCharge?: number;
}

// `as unknown as` (not a plain `as`): the generated JSON's weapon rows have per-weapon key sets
// (a physical-only weapon has no `fire` key), so TS infers a union whose optional members don't
// overlap a Record<string, number> index signature. The shape below is the contract the
// generators guarantee.
const data = raw as unknown as {
  /** Fixed POIs keyed by Shifting Earth ("Default"/"Crater"/"Mountaintop"/"Rotted Woods"/
   *  "Noklateo"). Each earth lists only the fixed POIs its terrain hasn't buried (its
   *  coordinate file is a subset of Default) plus its own boon type, so the set is correct
   *  for that run instead of always showing the Default-map POIs. */
  staticByEarth: Record<string, RawMarker[]>;
  patterns: NightreignPattern[];
  nightfarers: Nightfarer[];
  relics: { colors: RelicColor[]; deepRelics: DeepRelic[]; categories: RelicCategory[] };
  remembrances: HeroRemembrance[];
  tutorials: { categories: GuideCategory[] };
  weapons: NrWeapon[];
};

export const nrPatterns = data.patterns;

// ── Text localization ───────────────────────────────────────────────────────
// NR game text (nightfarer / ability / relic strings) swaps by language through a
// flat { englishText: localizedText } overlay, built by build-nr-i18n-overlay.mjs
// from the game's own per-language FMGs. Structure / ids / coordinates never change
// — only the human-readable strings — so the marker set and every lookup stay
// byte-identical to English. The localized views below are LIVE BINDINGS (`let`),
// rebuilt in place when the overlay swaps; consumers re-render through their
// useTranslation() (driven by the language flip) and re-read the fresh binding.
// Relic effects the generator synthesises from params (e.g. "Vigor +1") have no
// whole-string FMG source, so L() leaves them untouched and they keep English.
let nrText: Record<string, string> = {};
const L = <T extends string | null>(s: T): T => (typeof s === "string" ? ((nrText[s] ?? s) as T) : s);
const localizeAbility = (a: NightfarerAbility): NightfarerAbility => ({
  ...a,
  name: L(a.name),
  summary: L(a.summary),
  description: L(a.description),
});

/** The 8 playable Nightfarers (Heroes) — build + ability kit, for the Nightfarer browser. */
export let nrNightfarers: Nightfarer[] = data.nightfarers;

/** Relic data: the 4 colours' effect pools + the signature deep relics. */
export let nrRelics = data.relics;

/** Per-Nightfarer Remembrance quest chains (journal entries + objective steps, in play
 *  order). Game text is English-only for now — the NR i18n overlay doesn't cover it yet. */
export const nrRemembrances = data.remembrances;

/** The in-game Guide archive (Basic Rules / Expedition Region / Roundtable Hold). */
export const nrGuideCategories = data.tutorials.categories;

/** The armoury: every named base weapon, rarity-sorted (legendaries first). */
export const nrWeapons = data.weapons;

/** Nightlord registry keyed by short name (boss form, weakness, lore, portrait icon). */
export let nrNightlordMeta = new Map<string, NightlordMeta>();

const rebuildNrText = () => {
  nrNightfarers = data.nightfarers.map((nf) => ({
    ...nf,
    name: L(nf.name),
    lore: L(nf.lore),
    skill: localizeAbility(nf.skill),
    ultimateArt: localizeAbility(nf.ultimateArt),
    passive: localizeAbility(nf.passive),
  }));
  nrRelics = {
    ...data.relics,
    colors: data.relics.colors.map((c) => ({
      ...c,
      effects: c.effects.map((e) => ({ ...e, name: L(e.name) })),
    })),
    deepRelics: data.relics.deepRelics.map((d) => ({
      ...d,
      name: L(d.name),
      lore: L(d.lore),
      effects: d.effects.map((e) => ({ ...e, name: L(e.name) })),
    })),
    categories: data.relics.categories.map((c) => ({ ...c, label: L(c.label) })),
  };
  nrNightlordMeta = new Map(
    data.patterns.flatMap((p) =>
      p.nightlordMeta
        ? [[
            p.nightlord,
            { ...p.nightlordMeta, bossForm: L(p.nightlordMeta.bossForm), description: L(p.nightlordMeta.description) },
          ] as const]
        : [],
    ),
  );
};
rebuildNrText(); // initial English pass (overlay empty → identity)

/** Swap the NR text overlay (null → back to English) and rebuild the localized
 *  views in place. Called by the data-localization orchestrator before the UI
 *  language flips, so consumers see the localized strings on their next render. */
export const applyNrTextOverlay = (overlay: Record<string, string> | null) => {
  nrText = overlay ?? {};
  rebuildNrText();
};

/** Distinct values in pattern order, for the seed dropdowns. Boss / earth NAMES come
 *  from the item bundle (not the menu overlay), so these stay in English for now. */
export const nrNightlords = [...new Set(data.patterns.map((p) => p.nightlord))];
export const nrShiftingEarths = [...new Set(data.patterns.map((p) => p.shiftingEarth))];

export const nrMatchingPatterns = (nightlord: string, shiftingEarth: string) =>
  data.patterns.filter(
    (p) => p.nightlord === nightlord && p.shiftingEarth === shiftingEarth,
  );

const toMarker = (m: RawMarker): Marker => ({
  id: m.id,
  game: "nightreign",
  layer: "limveld",
  category: m.category,
  name: m.name,
  region: m.region,
  pixel: { x: m.x, y: m.y },
  seeded: m.seeded,
  day: m.day,
  icon: m.icon,
  bossMeta: m.bossMeta, // NR-native combat intel → shared detail panel renders weakness/HP
  description: m.description,
});

/** Static fixed POIs for the pattern's Shifting Earth (grace/scarab/… minus what that
 *  earth's terrain buries, plus its own boon type) + the chosen pattern's seeded POIs.
 *  Falls back to the Default set when there's no pattern yet or an unknown earth. */
export const nrMarkersForPattern = (pattern: NightreignPattern | undefined): Marker[] => [
  ...(data.staticByEarth[pattern?.shiftingEarth ?? "Default"] ?? data.staticByEarth.Default).map(toMarker),
  ...(pattern ? pattern.markers.map(toMarker) : []),
];
