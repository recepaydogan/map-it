import { computeAR, maxUpgrade, requirements, type ArResult, type DamageKey, type StatKey } from "../../../data/er-ar";
import { erItemByKey, erItems } from "../../../data/er-items-data";
import { ER_ATTRIBUTES, STAT_STORE_KEY, erClasses, levelForBuild } from "../../../data/er-reference";
import type { Combat } from "../../../data/combat";
import { resourceValue, weaponProfiles, type WeaponProfile } from "./advisor-data";
import { bossDamageMultiplier } from "./boss-profile";
import type {
  BuildStats,
  BuildStyle,
  ItemAccessResolver,
  WeaponRecommendation,
} from "./types";
import { upgradeForRuneLevel } from "./progression-model";
import { scoreWeaponFit, statusTier, statusTierWeight } from "./weapon-scoring";

const profileById = new Map(weaponProfiles.map((profile) => [profile.id, profile]));
const baseItems = new Map(erItems.filter((item) => item.category === "weapon").map((item) => [item.id, item]));
const blockedWeaponTypes = new Set([
  "Arrow", "Bolt", "Greatarrow", "Greatbolt", "Ballista", "Bow", "Crossbow", "Greatbow",
  "Light Bow", "Glintstone Staff", "Sacred Seal", "Small Shield", "Medium Shield", "Greatshield",
]);
const damageMap: Record<DamageKey, string> = {
  physical: "Physical", magic: "Magic", fire: "Fire", lightning: "Lightning", holy: "Holy",
};
const storeMap: Record<StatKey, string> = { str: "Str", dex: "Dex", int: "Int", fai: "Fai", arc: "Arc" };

const physicalAttackTypesFor = (
  damageParts: WeaponRecommendation["damageParts"],
  attackTypes: string[],
): string[] => damageParts.some((part) => part.type === "physical" && part.raw > 0) ? attackTypes : [];

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const practicalStatTargets = (
  profile: WeaponProfile,
  level: number,
  style: BuildStyle,
  twoHanded: boolean,
) => {
  const item = baseItems.get(profile.baseId);
  const needs = requirements(profile.id);
  const usesCastingStat = Math.max(needs.int ?? 0, needs.fai ?? 0) >= 15;
  const vigorBias = style === "survival" ? 5 : style === "damage" ? -5 : 0;
  const levelEnduranceCap = clamp(Math.round(14 + level * 0.12), 15, 30);
  return {
    Vig: clamp(Math.round(20 + Math.max(0, level - 20) * 0.33) + vigorBias, 20, 60),
    Mind: clamp(14 + (usesCastingStat ? 4 : 0) + (style === "damage" ? 2 : 0), 12, 22),
    End: clamp(
      Math.round(14 + (item?.weight ?? 0) * 0.35 + (twoHanded ? 0 : 2) + (style === "survival" ? 3 : 0)),
      14,
      levelEnduranceCap,
    ),
  };
};

const adjustArForBoss = (ar: ArResult, combat: Combat, attackTypes: string[]) => {
  const parts = ar.parts.map((part) => {
    const multiplier = bossDamageMultiplier(combat, damageMap[part.type], attackTypes);
    return { type: part.type, raw: part.total, adjusted: part.total * multiplier, multiplier };
  });
  return { parts, total: parts.reduce((sum, part) => sum + part.adjusted, 0) };
};

const buildFromClass = (
  profile: WeaponProfile,
  combat: Combat,
  level: number,
  upgradeLevel: number,
  style: BuildStyle,
  twoHanded: boolean,
) => {
  const upgrade = upgradeForRuneLevel(upgradeLevel, maxUpgrade(profile.id));
  let best: {
    stats: BuildStats;
    className: string;
    adjustedAr: number;
    rawAr: number;
    primaryDamage: string;
    damageParts: WeaponRecommendation["damageParts"];
  } | null = null;
  const candidates = erClasses.flatMap((characterClass) => {
    const stats = Object.fromEntries(
      ER_ATTRIBUTES.map((attribute) => [STAT_STORE_KEY[attribute], characterClass.stats[attribute] ?? 10]),
    ) as Record<string, number>;
    for (const [key, need] of Object.entries(requirements(profile.id)) as [StatKey, number][]) {
      const required = key === "str" && twoHanded ? Math.ceil(need / 1.5) : need;
      stats[storeMap[key]] = Math.max(stats[storeMap[key]], required);
    }
    const currentLevel = levelForBuild(characterClass, stats);
    return currentLevel <= level ? [{ characterClass, stats, currentLevel }] : [];
  }).sort((a, b) => a.currentLevel - b.currentLevel).slice(0, 3);

  for (const candidate of candidates) {
    const { characterClass, stats } = candidate;
    let currentLevel = candidate.currentLevel;
    const arStats = (): Record<StatKey, number> => ({
      str: stats.Str, dex: stats.Dex, int: stats.Int, fai: stats.Fai, arc: stats.Arc,
    });
    const attack = () => {
      const ar = computeAR(profile.id, upgrade, arStats(), twoHanded);
      if (!ar || ar.unmet.length) return null;
      const adjusted = adjustArForBoss(ar, combat, profile.attackTypes);
      const primary = [...ar.parts].sort((a, b) => b.total - a.total)[0]?.type ?? "physical";
      return {
        ar,
        adjustedAr: adjusted.total,
        damageParts: adjusted.parts,
        primaryDamage: damageMap[primary],
      };
    };

    const targets = practicalStatTargets(profile, level, style, twoHanded);
    while (currentLevel < level) {
      let raisedTarget = false;
      for (const key of ["Vig", "End", "Mind"] as const) {
        if (currentLevel >= level || stats[key] >= targets[key]) continue;
        stats[key] += 1;
        currentLevel += 1;
        raisedTarget = true;
      }
      if (!raisedTarget) break;
    }

    while (currentLevel < level) {
      const beforeAttack = attack()?.adjustedAr ?? 1;
      const beforeHp = resourceValue("hp", stats.Vig);
      const beforeFp = resourceValue("fp", stats.Mind);
      const beforeStamina = resourceValue("stamina", stats.End);
      const options: { key: string; gain: number }[] = [];
      for (const key of ["Str", "Dex", "Int", "Fai", "Arc"]) {
        if (stats[key] >= 99) continue;
        stats[key] += 1;
        const after = attack()?.adjustedAr ?? beforeAttack;
        stats[key] -= 1;
        const weight = style === "damage" ? 1.45 : style === "survival" ? 0.75 : 1;
        options.push({ key, gain: ((after - beforeAttack) / beforeAttack) * 100 * weight });
      }
      const vigorCap = Math.min(60, targets.Vig + (style === "survival" ? 8 : style === "balanced" ? 4 : 0));
      if (stats.Vig < vigorCap) {
        const gain = ((resourceValue("hp", stats.Vig + 1) - beforeHp) / Math.max(1, beforeHp)) * 100;
        options.push({ key: "Vig", gain: gain * (style === "survival" ? 1.1 : style === "damage" ? 0.4 : 0.65) });
      }
      if (stats.Mind < targets.Mind + 2) {
        const gain = ((resourceValue("fp", stats.Mind + 1) - beforeFp) / Math.max(1, beforeFp)) * 100;
        options.push({ key: "Mind", gain: gain * 0.18 });
      }
      if (stats.End < targets.End + 2) {
        const staminaGain = (resourceValue("stamina", stats.End + 1) - beforeStamina) / Math.max(1, beforeStamina);
        options.push({
          key: "End",
          gain: staminaGain * 100 * (style === "survival" ? 0.55 : 0.3),
        });
      }
      const chosen = options.sort((a, b) => b.gain - a.gain)[0];
      if (!chosen) break;
      stats[chosen.key] += 1;
      currentLevel += 1;
    }
    const result = attack();
    if (!result) continue;
    if (!best || result.adjustedAr > best.adjustedAr) {
      best = {
        stats: {
          vig: stats.Vig, mind: stats.Mind, end: stats.End,
          str: stats.Str, dex: stats.Dex, int: stats.Int, fai: stats.Fai, arc: stats.Arc,
        },
        className: characterClass.name,
        adjustedAr: result.adjustedAr,
        rawAr: result.ar.total,
        damageParts: result.damageParts,
        primaryDamage: result.primaryDamage,
      };
    }
  }
  return best ? { ...best, upgrade } : null;
};

const weaponScore = (
  profile: WeaponProfile,
  subtype: string | undefined,
  stats: Record<StatKey, number>,
  upgrade: number,
  combat: Combat,
  bossHp: number | undefined,
  style: BuildStyle,
) => {
  const ar = computeAR(profile.id, upgrade, stats, true);
  if (!ar || ar.unmet.length) return -Infinity;
  const adjusted = adjustArForBoss(ar, combat, profile.attackTypes);
  return scoreWeaponFit({
    adjustedAr: adjusted.total,
    buildup: profile.buildup,
    combat,
    subtype,
    bossHp,
    style,
    damageChannels: adjusted.parts.length,
  }).total;
};

const recommendationFromProfile = (
  profile: WeaponProfile,
  combat: Combat,
  level: number,
  upgradeLevel: number,
  style: BuildStyle,
  twoHanded: boolean,
  bossHp?: number,
): WeaponRecommendation | null => {
  const item = baseItems.get(profile.baseId);
  const build = item ? buildFromClass(profile, combat, level, upgradeLevel, style, twoHanded) : null;
  if (!item || !build) return null;
  const fit = scoreWeaponFit({
    adjustedAr: build.adjustedAr,
    buildup: profile.buildup,
    combat,
    subtype: item.subtype,
    bossHp,
    style,
    damageChannels: build.damageParts.length,
  });
  return {
    item: erItemByKey.get(`weapon:${item.id}`) ?? item,
    weaponId: profile.id,
    profileId: profile.id,
    affinity: profile.affinity,
    upgrade: build.upgrade,
    maxUpgrade: maxUpgrade(profile.id),
    adjustedAr: Math.round(build.adjustedAr),
    fitScore: fit.total,
    directScore: fit.direct,
    statusScore: fit.status,
    rawAr: Math.round(build.rawAr),
    className: build.className,
    stats: build.stats,
    attackTypes: physicalAttackTypesFor(build.damageParts, profile.attackTypes),
    buildup: profile.buildup
      .filter((entry) => statusTierWeight(combat, entry.type) > 0)
      .map((entry) => ({ ...entry, tier: statusTier(combat, entry.type) })),
    damageParts: build.damageParts,
    primaryDamage: build.primaryDamage,
    reason: fit.statusShare >= 0.04 ? "damageAndStatus" : "bossDamage",
  };
};

export const recommendWeapons = (
  combat: Combat,
  level: number,
  style: BuildStyle,
  twoHanded: boolean,
  access: ItemAccessResolver,
  bossHp?: number,
  upgradeLevel = level,
) => {
  const baselineValue = Math.min(60, Math.max(12, Math.round(level / 7)));
  const baseline: Record<StatKey, number> = {
    str: baselineValue, dex: baselineValue, int: baselineValue, fai: baselineValue, arc: baselineValue,
  };
  const preliminary = weaponProfiles
    .flatMap((profile) => {
      const item = baseItems.get(profile.baseId);
      const itemAccess = item ? access(item) : undefined;
      if (!item?.subtype || blockedWeaponTypes.has(item.subtype) || !itemAccess?.available) return [];
      const stats = { ...baseline };
      for (const [key, need] of Object.entries(requirements(profile.id)) as [StatKey, number][]) {
        const required = key === "str" && twoHanded ? Math.ceil(need / 1.5) : need;
        stats[key] = Math.max(stats[key], required);
      }
      return [{
        profile,
        score: weaponScore(
          profile,
          item.subtype,
          stats,
          upgradeForRuneLevel(level, maxUpgrade(profile.id)),
          combat,
          bossHp,
          style,
        ),
        effort: itemAccess.effort,
      }];
    });
  const shortlist = new Map<number, (typeof preliminary)[number]>();
  for (const entry of [...preliminary].sort((a, b) => b.score - a.score).slice(0, 56)) {
    shortlist.set(entry.profile.id, entry);
  }
  for (const entry of [...preliminary]
    .sort((a, b) => (b.score - b.effort * 60) - (a.score - a.effort * 60))
    .slice(0, 32)) {
    shortlist.set(entry.profile.id, entry);
  }

  const ranked: WeaponRecommendation[] = [];
  for (const { profile } of shortlist.values()) {
    const recommendation = recommendationFromProfile(profile, combat, level, upgradeLevel, style, twoHanded, bossHp);
    if (recommendation) ranked.push(recommendation);
  }
  ranked.sort((a, b) => b.fitScore - a.fitScore);
  const unique: WeaponRecommendation[] = [];
  for (const entry of ranked) {
    if (unique.some((other) => other.item.id === entry.item.id)) continue;
    unique.push(entry);
  }
  return unique;
};

export const recommendLinkedBossWeapons = (
  candidateKeys: string[],
  combat: Combat,
  level: number,
  upgradeLevel: number,
  style: BuildStyle,
  twoHanded: boolean,
  access: ItemAccessResolver,
  bossHp?: number,
): WeaponRecommendation[] => {
  const weaponIds = new Set(
    candidateKeys
      .filter((key) => key.startsWith("weapon:"))
      .map((key) => Number(key.slice("weapon:".length))),
  );
  return weaponProfiles
    .filter((profile) => {
      const item = baseItems.get(profile.baseId);
      return weaponIds.has(profile.baseId) && Boolean(item && access(item).available);
    })
    .map((profile) => recommendationFromProfile(profile, combat, level, upgradeLevel, style, twoHanded, bossHp))
    .filter((entry): entry is WeaponRecommendation => entry !== null)
    .sort((a, b) => b.fitScore - a.fitScore);
};

export const weaponProfileById = (profileId: number): WeaponProfile | undefined => profileById.get(profileId);
