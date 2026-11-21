import type { MapPoint } from "./types";
import type { MapCharacterProfile } from "./map-character-profiles";

export const TRAINER_CATEGORIES = ["class-trainer", "profession-trainer"] as const;
export type TrainerCategory = typeof TRAINER_CATEGORIES[number];

const CLASS_NAMES: string[] = [];
const PROFESSION_NAMES: string[] = [];

export const TRAINER_FILTER_IDS: Record<TrainerCategory, readonly string[]> = {
  "class-trainer": [...CLASS_NAMES.map((name) => name.toLowerCase()), "other"],
  "profession-trainer": [...PROFESSION_NAMES.map((name) => name.toLowerCase().replaceAll(" ", "-")), "weapon-master", "other"],
};

const PROFESSION_MATCHERS: [string, RegExp][] = [];

export const trainerFilterKey = (category: TrainerCategory, id: string) => `${category}:${id}`;

/** Profile choices seed defaults; a saved filter selection remains user-controlled. */
export const resolveHiddenTrainerTypes = (
  stored: string | null,
  character: Pick<MapCharacterProfile, "classId" | "professions"> | null,
): string[] => {
  const keys = TRAINER_CATEGORIES.flatMap((category) => TRAINER_FILTER_IDS[category]
    .map((id) => trainerFilterKey(category, id)));
  if (stored !== null) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) return keys.filter((key) => parsed.includes(key));
    } catch { /* Invalid storage falls back to the profile defaults. */ }
  }
  if (!character) return [];
  const enabled = new Set([
    trainerFilterKey("class-trainer", character.classId),
    ...character.professions.map(({ id }) =>
      trainerFilterKey("profession-trainer", id === "firstaid" ? "first-aid" : id)),
  ]);
  return keys.filter((key) => !enabled.has(key));
};

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
