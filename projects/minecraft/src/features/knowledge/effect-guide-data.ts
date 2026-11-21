import { GAME_GUIDE_EFFECTS } from "../../game-config.ts";

export type EffectGuideEntry = (typeof GAME_GUIDE_EFFECTS)[number];

const versionOrder = new Intl.Collator("en", { numeric: true });

export const createEffectGuideIndex = (edition: string, version: string): ReadonlyMap<string, EffectGuideEntry> =>
  new Map(GAME_GUIDE_EFFECTS.filter(effect => {
    if (edition === "bedrock") return !("javaOnly" in effect);
    if (edition !== "java" || "bedrockOnly" in effect) return false;
    return !("sinceJava" in effect) || versionOrder.compare(version, effect.sinceJava) >= 0;
  }).map(effect => [`minecraft:${effect.key}`, effect]));

export const effectGuidePotionIds = (effect: EffectGuideEntry, availableItems: ReadonlySet<string>): readonly string[] => {
  if (!("potion" in effect)) return [];
  return ["potion", "splash_potion", "lingering_potion"]
    .map(container => `minecraft:${container}/${effect.potion}`)
    .filter(id => availableItems.has(id));
};
