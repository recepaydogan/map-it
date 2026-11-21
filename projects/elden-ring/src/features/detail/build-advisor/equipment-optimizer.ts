import { requirements, type StatKey } from "../../../data/er-ar";
import { erItemExtra } from "../../../data/er-codex-extras";
import { erItemByKey, erItemKey, type ErItem } from "../../../data/er-items-data";
import { compatibleAshes, maxEquipLoad, weaponProfiles, type WeaponProfile } from "./advisor-data";
import { scoreSupportEffect } from "./support-scoring";
import type {
  BuildStyle,
  ItemAccessResolver,
  RecommendedItem,
  WeaponRecommendation,
} from "./types";

const statValue: Record<StatKey, keyof WeaponRecommendation["stats"]> = {
  str: "str", dex: "dex", int: "int", fai: "fai", arc: "arc",
};

const meetsRequirements = (item: ErItem, weapon: WeaponRecommendation): boolean =>
  (Object.entries(requirements(item.id)) as [StatKey, number][]).every(
    ([stat, required]) => weapon.stats[statValue[stat]] >= required,
  );

const isPlayerFacingAshOfWar = (item: ErItem): boolean =>
  item.icon_id > 0 && !/\b(?:dummy|placeholder)\b/i.test(item.name);

const defenseKey: Record<string, string> = {
  Physical: "Phy", Standard: "Phy", Slash: "Slash", Strike: "Strike", Pierce: "Pierce",
  Magic: "Mag", Fire: "Fire", Lightning: "Ltn", Holy: "Holy",
};

export const recommendOffhand = (
  weapon: WeaponRecommendation,
  defenseFocus: string[],
  style: BuildStyle,
  access: ItemAccessResolver,
): RecommendedItem | undefined => {
  const maxLoad = maxEquipLoad(weapon.stats.end);
  const candidates = weaponProfiles.flatMap((profile) => {
    const item = erItemByKey.get(`weapon:${profile.baseId}`);
    if (!item || !["Small Shield", "Medium Shield", "Greatshield"].includes(item.subtype ?? "")) return [];
    const itemAccess = access(item);
    if (!itemAccess.available) return [];
    if (!meetsRequirements(item, weapon) || (item.weight ?? 0) + (weapon.item.weight ?? 0) > maxLoad) return [];
    const guard = defenseFocus.reduce((sum, type) => {
      const field = type === "Physical" || type in defenseKey ? type.toLowerCase() : "physical";
      const key = field === "ltn" ? "lightning" : field === "phy" ? "physical" : field;
      return sum + (profile.guard[key as keyof typeof profile.guard] ?? profile.guard.physical);
    }, 0) / Math.max(1, defenseFocus.length);
    const weightPenalty = (item.weight ?? 0) * (style === "survival" ? 0.2 : 0.55);
    return [{
      item,
      score: guard + profile.guard.boost * 1.25 - weightPenalty,
    }];
  }).sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return best ? { item: best.item, reason: "guardFit" } : undefined;
};

export const recommendAshOfWar = (
  profile: WeaponProfile,
  weapon: WeaponRecommendation,
  defenseFocus: string[],
  style: BuildStyle,
  access: ItemAccessResolver,
): RecommendedItem | undefined => {
  const candidates = compatibleAshes(profile).flatMap((ash) => {
    const item = erItemByKey.get(`gem:${ash.itemId}`);
    if (!item || !isPlayerFacingAshOfWar(item) || !access(item).available) return [];
    const extra = erItemExtra(erItemKey(item));
    const effect = scoreSupportEffect(item, { weapon, defenseFocus, style, twoHanded: true, access });
    const fp = extra?.skill?.fp ?? 0;
    const affinityFit = ash.defaultAffinity === profile.affinityIndex ? 8 : 0;
    return [{
      item,
      score: Math.max(0, effect) + affinityFit + (fp > 0 ? 20 / fp : 0),
    }];
  }).sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return best ? { item: best.item, reason: "skillSynergy" } : undefined;
};
