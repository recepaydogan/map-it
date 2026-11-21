import type { MapPoint } from "./types";

export const TRAINER_CATEGORIES = ["class-trainer", "profession-trainer"] as const;
export type TrainerCategory = typeof TRAINER_CATEGORIES[number];

const CLASS_NAMES = ["Druid", "Hunter", "Mage", "Paladin", "Priest", "Rogue", "Shaman", "Warlock", "Warrior"] as const;
const PROFESSION_NAMES = [
  "Alchemy", "Blacksmithing", "Cooking", "Enchanting", "Engineering", "First Aid",
  "Fishing", "Herbalism", "Leatherworking", "Mining", "Skinning", "Tailoring",
] as const;

export const TRAINER_FILTER_IDS: Record<TrainerCategory, readonly string[]> = {
  "class-trainer": [...CLASS_NAMES.map((name) => name.toLowerCase()), "other"],
  "profession-trainer": [...PROFESSION_NAMES.map((name) => name.toLowerCase().replaceAll(" ", "-")), "weapon-master", "other"],
};

const PROFESSION_MATCHERS: [string, RegExp][] = [
  ["alchemy", /alchem/i], ["blacksmithing", /blacksmith/i], ["cooking", /cook/i],
  ["enchanting", /enchant/i], ["engineering", /engineer/i],
  ["first-aid", /first aid|medic|physician/i], ["fishing", /fish/i],
  ["herbalism", /herbal/i], ["leatherworking", /leatherwork/i],
  ["mining", /min(?:er|ing)\b/i], ["skinning", /skinn?/i], ["tailoring", /tailor/i],
];

export const trainerFilterKey = (category: TrainerCategory, id: string) => `${category}:${id}`;

/** Source catalogs split Weapon Masters across both trainer categories. Show them together. */
export const getTrainerFilterCategory = (point: MapPoint): TrainerCategory | null => {
  if (point.category !== "class-trainer" && point.category !== "profession-trainer") return null;
  const className = "trainerClass" in point ? point.trainerClass : undefined;
  return className?.trim().toLowerCase() === "weapon master" ? "profession-trainer" : point.category;
};

export const getTrainerFilterId = (point: MapPoint): string | null => {
  const category = getTrainerFilterCategory(point);
  if (category === "class-trainer") {
    const name = "trainerClass" in point ? point.trainerClass?.trim().toLowerCase() : undefined;
    return name && TRAINER_FILTER_IDS["class-trainer"].includes(name) ? name : "other";
  }
  if (category === "profession-trainer") {
    const title = "trainerTitle" in point ? point.trainerTitle?.trim() || point.label : point.label;
    if (/weapon master/i.test(title) || ("trainerClass" in point && point.trainerClass?.trim().toLowerCase() === "weapon master")) {
      return "weapon-master";
    }
    return PROFESSION_MATCHERS.find(([, pattern]) => pattern.test(title))?.[0] ?? "other";
  }
  return null;
};

export const getTrainerFilterKey = (point: MapPoint): string | null => {
  const category = getTrainerFilterCategory(point);
  const id = getTrainerFilterId(point);
  return id && category ? trainerFilterKey(category, id) : null;
};
