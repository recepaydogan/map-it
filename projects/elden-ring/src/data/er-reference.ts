import raw from "./generated/er-reference.json";

/**
 * Elden Ring reference data straight from the game: the 10 starting classes
 * (CharaInitParam + BaseChrSelectMenuParam), the game's OWN attribute/stat tooltips
 * (GR_MenuText 30xxx), and the world's monument inscriptions (EventTextForMap).
 *
 * Built by data/src/build-er-reference.mjs. Nothing here is authored by us — every
 * string is the game's, every number is a param value.
 */

/** One piece of a class's starting kit, resolved to a real, drillable codex item. */
export interface ErClassGear {
  slot: string;
  itemId: number;
  name: string;
  iconId: number;
  /** `<group>:<id>` — the codex's collision-safe key (see erItemKey). */
  itemKey: string;
}

export interface ErClass {
  id: number;
  menuId: number;
  name: string;
  imageId: number;
  /** The class's starting level — the floor you can never go below. */
  soulLevel: number;
  /** All 8 attributes, keyed by their full English names. */
  stats: Record<string, number>;
  gear: ErClassGear[];
  /** Starting flask allotment: HP (Crimson) / FP (Cerulean) charges. */
  flasks: { hp: number; fp: number };
}

/** One official stat explainer — the exact text the game shows in its own menus. */
export interface ErStatHelp {
  key: string;
  label: string;
  text: string;
}

export interface ErStatHelpGroups {
  attributes: ErStatHelp[];
  derived: ErStatHelp[];
  defence: ErStatHelp[];
  resistance: ErStatHelp[];
  progression: ErStatHelp[];
}

/**
 * A piece of text the world itself carries — a war monument, a gravestone, one of the
 * DLC's Miquella crosses, or a Sorcerer's Rise seal riddle. The game shows each of these
 * once and never lets you re-read it; the params carry no coordinates for them, so this is
 * an archive to read, not pins to place.
 */
export type ErInscriptionKind = "monument" | "cross" | "grave" | "riddle" | "world";
export interface ErInscription {
  id: number;
  title: string | null;
  text: string;
  kind?: ErInscriptionKind;
}

const data = raw as unknown as {
  patch: string;
  classes: ErClass[];
  statHelp: ErStatHelpGroups;
  inscriptions: ErInscription[];
};

export const erClasses = data.classes;
export const erStatHelp = data.statHelp;
export const erInscriptions = data.inscriptions;

/** Every stat explainer flattened, so a lookup by key ("Vigor") is one map hit. */
const HELP_BY_KEY = new Map<string, ErStatHelp>(
  Object.values(data.statHelp)
    .flat()
    .map((h) => [h.key, h]),
);

/** The game's own one-paragraph explanation of an attribute/stat, or undefined. */
export const erStatText = (key: string): string | undefined => HELP_BY_KEY.get(key)?.text;

/** The 8 attributes in the game's own menu order — the order every stat row uses. */
export const ER_ATTRIBUTES = [
  "Vigor",
  "Mind",
  "Endurance",
  "Strength",
  "Dexterity",
  "Intelligence",
  "Faith",
  "Arcane",
] as const;
export type ErAttribute = (typeof ER_ATTRIBUTES)[number];

/** Attribute → the short key the player's build is stored under in map-store. */
export const STAT_STORE_KEY: Record<ErAttribute, string> = {
  Vigor: "Vig",
  Mind: "Mind",
  Endurance: "End",
  Strength: "Str",
  Dexterity: "Dex",
  Intelligence: "Int",
  Faith: "Fai",
  Arcane: "Arc",
};

/**
 * The level a build of these attributes sits at, if you started from this class.
 *
 * Elden Ring charges exactly one level per attribute point, so the level is simply the
 * class's starting level plus every point spent above its starting spread. A stat BELOW
 * the class's floor is impossible in-game (you can't refund into nothing), so those
 * points count as zero rather than as a discount — which is also why the cheapest class
 * for a given build is the one whose starting spread wastes the fewest points.
 */
export const levelForBuild = (cls: ErClass, build: Record<string, number>): number => {
  let level = cls.soulLevel;
  for (const attr of ER_ATTRIBUTES) {
    const want = build[STAT_STORE_KEY[attr]] ?? 10;
    const base = cls.stats[attr] ?? 10;
    if (want > base) level += want - base;
  }
  return level;
};

/** True when the build asks for less than this class already starts with — that attribute
 *  can't be un-levelled, so those points are sunk (and the class is a poor fit for it). */
export const wastedPoints = (cls: ErClass, build: Record<string, number>): number => {
  let waste = 0;
  for (const attr of ER_ATTRIBUTES) {
    const want = build[STAT_STORE_KEY[attr]] ?? 10;
    const base = cls.stats[attr] ?? 10;
    if (base > want) waste += base - want;
  }
  return waste;
};

/** The classes ranked for a target build: lowest reachable level first (ties → less waste). */
export const classesForBuild = (build: Record<string, number>): ErClass[] =>
  [...erClasses].sort(
    (a, b) =>
      levelForBuild(a, build) - levelForBuild(b, build) ||
      wastedPoints(a, build) - wastedPoints(b, build) ||
      a.name.localeCompare(b.name),
  );
