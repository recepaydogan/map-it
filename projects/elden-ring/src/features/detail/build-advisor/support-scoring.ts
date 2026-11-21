import { erItemExtra, erSpirit } from "../../../data/er-codex-extras";
import { erItemByKey, erItemKey, erItems, goodsKind, type ErItem } from "../../../data/er-items-data";
import { resourceValue } from "./advisor-data";
import type {
  BuildStats,
  BuildStyle,
  ItemAccessResolver,
  RecommendedItem,
  WeaponRecommendation,
} from "./types";

const engineElement: Record<string, string> = {
  Physical: "Physics", Magic: "Magic", Fire: "Fire", Lightning: "Thunder", Holy: "Dark",
};
const physicalField: Record<string, string> = {
  Standard: "neutral", Slash: "slash", Strike: "blow", Pierce: "thrust",
};
const statusWords: Record<string, string[]> = {
  Bleed: ["blood loss", "hemorrhage"],
  Frostbite: ["frost", "frostbite"],
  Poison: ["poison"],
  "Scarlet Rot": ["scarlet rot", "rot"],
  Sleep: ["sleep"],
};

const rateGain = (value: number | undefined, positive = true): number => {
  if (value == null) return 0;
  return (positive ? value - 1 : 1 - value) * 100;
};

interface ScoreContext {
  weapon: WeaponRecommendation;
  defenseFocus: string[];
  style: BuildStyle;
  twoHanded: boolean;
  access: ItemAccessResolver;
}

export const scoreSupportEffect = (item: ErItem, context: ScoreContext): number => {
  const extra = erItemExtra(erItemKey(item));
  const metrics = extra?.metrics;
  if (!metrics) return -Infinity;
  const { weapon, defenseFocus, twoHanded } = context;
  let offense = 0;
  let defense = 0;
  const element = engineElement[weapon.primaryDamage];
  if (element) {
    offense += rateGain(metrics[`${element.toLowerCase()}AttackRate`]) * 1.6;
    offense += rateGain(metrics[`atkEnemyDmgCorrectRate_${element}`]) * 1.8;
    offense += Number(metrics[`${element.toLowerCase()}AttackPower`] ?? 0) * 0.08;
  }
  offense += rateGain(metrics.physicsAttackPowerRate) * (weapon.primaryDamage === "Physical" ? 1.3 : 0.25);
  offense += rateGain(metrics.saAttackPowerRate) * 0.9;
  for (const type of weapon.attackTypes) {
    const field = physicalField[type];
    if (field) offense += rateGain(metrics[`${field}AttackPowerRate`]) * 1.25;
  }

  for (const type of defenseFocus) {
    const engine = engineElement[type];
    const field = engine ? `${engine.toLowerCase()}DamageCutRate` : `${physicalField[type] ?? "neutral"}DamageCutRate`;
    defense += rateGain(metrics[field], false) * 1.5;
    if (engine) defense += rateGain(metrics[`defEnemyDmgCorrectRate_${engine}`], false) * 1.7;
  }
  defense += rateGain(metrics.maxHpRate) * 0.8;
  defense += rateGain(metrics.maxStaminaRate) * 0.45;
  defense += rateGain(metrics.equipWeightChangeRate) * 0.35;
  defense += Number(metrics.changeSuperArmorPoint ?? metrics.changeSaPoint ?? 0) * 0.08;
  defense += Number(metrics.staminaRecoverChangeSpeed ?? 0) * 0.35;

  const info = (extra?.info ?? item.description).toLowerCase();
  for (const buildup of weapon.buildup) {
    if ((statusWords[buildup.type] ?? []).some((word) => info.includes(word))) offense += 18;
  }
  if (twoHanded && info.includes("two-handed")) offense += 22;
  if (info.includes("skills")) offense += 8;
  if (info.includes("charged attacks")) offense += 5;

  const universalPenalty = [
    "neutralDamageCutRate", "slashDamageCutRate", "blowDamageCutRate", "thrustDamageCutRate",
    "magicDamageCutRate", "fireDamageCutRate", "thunderDamageCutRate", "darkDamageCutRate",
  ].reduce((sum, field) => sum + Math.max(0, rateGain(metrics[field])), 0);
  const penalty = universalPenalty * 0.6 + Math.max(0, -Number(metrics.maxHpRate ?? 1) + 1) * 100;
  const styleOffense = context.style === "damage" ? 1.35 : context.style === "survival" ? 0.75 : 1;
  const styleDefense = context.style === "survival" ? 1.5 : context.style === "damage" ? 0.65 : 1;
  return offense * styleOffense + defense * styleDefense - penalty;
};

const familyKey = (item: ErItem): string =>
  item.name.toLowerCase().replace(/\s*\+\d+\s*$/, "").replace(/\s+/g, " ").trim();

const rank = (items: ErItem[], count: number, context: ScoreContext, reason: string): RecommendedItem[] => {
  const ranked = items
    .filter((item) => context.access(item).available)
    .map((item) => ({
      item,
      score: scoreSupportEffect(item, context),
    }))
    .filter((entry) => Number.isFinite(entry.score) && entry.score > 0)
    .sort((a, b) => b.score - a.score);
  const result: RecommendedItem[] = [];
  const families = new Set<string>();
  for (const entry of ranked) {
    const family = familyKey(entry.item);
    if (families.has(family)) continue;
    families.add(family);
    result.push({ item: entry.item, reason });
    if (result.length === count) break;
  }
  return result;
};

export const recommendTalismans = (context: ScoreContext): RecommendedItem[] =>
  rank(erItems.filter((item) => item.category === "talisman"), 4, context, "effectFit");

export const recommendTears = (context: ScoreContext): RecommendedItem[] =>
  rank(erItems.filter((item) => goodsKind(item) === "Crystal Tear"), 2, context, "effectFit");

export const recommendConsumables = (context: ScoreContext): RecommendedItem[] =>
  rank(
    erItems.filter((item) => item.category === "consumable" && !goodsKind(item)),
    3,
    context,
    "effectFit",
  );

export const recommendSpirit = (
  stats: BuildStats,
  level: number,
  access: ItemAccessResolver,
): RecommendedItem | undefined => {
  const upgrade = Math.min(10, Math.max(0, Math.round(level / 15)));
  const fpBudget = resourceValue("fp", stats.mind);
  const hpBudget = resourceValue("hp", stats.vig);
  const candidates = erItems.flatMap((item) => {
    const itemAccess = access(item);
    if (!itemAccess.available) return [];
    const spirit = erSpirit(erItemKey(item));
    if (!spirit) return [];
    if (spirit.costFp != null && spirit.costFp > fpBudget) return [];
    if (spirit.costHp != null && spirit.costHp > hpBudget * 0.45) return [];
    const entityHp = spirit.entities?.reduce((sum, entity) => sum + entity.hp[upgrade], 0)
      ?? spirit.hp[upgrade] * spirit.count;
    const durability = entityHp * (1 + spirit.poise / 300);
    const cost = spirit.costFp ?? (spirit.costHp ?? 0) / 6;
    return [{
      item,
      score: durability * spirit.attackRate[upgrade] / Math.max(30, cost),
    }];
  }).sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return best ? { item: best.item, reason: "spiritPower", detail: `+${upgrade}` } : undefined;
};

export const itemFromKey = (key: string): ErItem | undefined => erItemByKey.get(key);
