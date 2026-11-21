import type { Combat } from "../../../data/combat";
import type { MapLayer } from "../../../data/types";
import { directAcquisitionSourceRegion } from "../../../data/item-acquisition-sources";
import { recommendationItemAccess } from "../../../data/item-acquisition";
import {
  isDlcBoss,
  maxEquipLoad,
  resolveBossAttackProfile,
  scadutreeEffect,
  specialCandidateKeys,
} from "./advisor-data";
import { recommendBossCounters } from "./boss-counter-optimizer";
import { recommendAshOfWar, recommendOffhand } from "./equipment-optimizer";
import { recommendSpells } from "./spell-optimizer";
import {
  assessProgression,
  performanceFloorFor,
  progressionProfileFor,
} from "./progression-model";
import {
  consistentlyExploitsDamageOpportunity,
  primaryDamageOpportunity,
} from "./boss-profile";
import {
  itemFromKey,
  recommendConsumables,
  recommendSpirit,
  recommendTalismans,
  recommendTears,
} from "./support-scoring";
import { createStaggerPlan } from "./stagger-plan";
import type {
  BossBuildRecommendation,
  BuildStyle,
  ItemAccessResolver,
  WeaponRecommendation,
} from "./types";
import { recommendLinkedBossWeapons, recommendWeapons, weaponProfileById } from "./weapon-optimizer";
import { rankBossWeaponCandidates } from "./weapon-matchup";

export interface RecommendBossBuildInput {
  markerId: string;
  npcParamId?: number;
  bossName: string;
  combat: Combat;
  level: number;
  style: BuildStyle;
  twoHanded: boolean;
  bossHp?: number;
  bossRunes?: number;
  bossPoise?: number;
  bossRegion?: string;
  bossScaleRegion?: string;
  scadutreeLevel?: number;
  spiritAshAllowed: boolean;
  encounterLayer?: MapLayer;
}

export const recommendBossBuild = ({
  markerId,
  npcParamId,
  bossName,
  combat,
  level,
  style,
  twoHanded,
  bossHp,
  bossRunes,
  bossPoise,
  bossRegion,
  bossScaleRegion,
  scadutreeLevel,
  spiritAshAllowed,
  encounterLayer,
}: RecommendBossBuildInput): BossBuildRecommendation | null => {
  const encounterIsDlc = encounterLayer === "dlc-realm-of-shadow" || isDlcBoss(markerId);
  const access: ItemAccessResolver = (item) => recommendationItemAccess(item, markerId, {
    layer: encounterLayer,
    region: directAcquisitionSourceRegion(markerId) ?? bossRegion,
    scaleRegion: bossScaleRegion,
  });
  const candidateKeys = specialCandidateKeys(markerId);
  const progressionProfile = progressionProfileFor({
    hp: bossHp,
    runes: bossRunes,
    poise: bossPoise,
    isDlc: encounterIsDlc,
    style,
    region: directAcquisitionSourceRegion(markerId) ?? bossRegion,
    scaleRegion: bossScaleRegion,
  });
  const upgradeLevel = level;
  const regularWeapons = recommendWeapons(combat, level, style, twoHanded, access, bossHp, upgradeLevel);
  const linkedWeapons = recommendLinkedBossWeapons(
    candidateKeys,
    combat,
    level,
    upgradeLevel,
    style,
    twoHanded,
    access,
    bossHp,
  );
  const weaponCandidates = [...regularWeapons, ...linkedWeapons]
    .filter((entry, index, all) => all.findIndex((candidate) => candidate.item.id === entry.item.id) === index)
    .map((entry) => {
      const profile = weaponProfileById(entry.profileId);
      return {
        ...entry,
        staggerPlan: profile
          ? createStaggerPlan(profile, bossPoise, entry.upgrade, twoHanded)
          : undefined,
      };
    });
  const bestFit = Math.max(...weaponCandidates.map((entry) => entry.fitScore));
  const performanceFloor = performanceFloorFor(progressionProfile, level);
  const damageOpportunity = primaryDamageOpportunity(combat);
  const exploitsPrimaryWeakness = (entry: WeaponRecommendation) => (
    consistentlyExploitsDamageOpportunity(entry, damageOpportunity)
  );
  const rankedWeapons = rankBossWeaponCandidates(weaponCandidates, combat);
  const weapons = rankedWeapons.slice(0, 1);
  const strongestTacticalAlternative = weaponCandidates
    .filter((entry) => (
      exploitsPrimaryWeakness(entry) && entry.fitScore >= bestFit * performanceFloor
    ))
    .sort((a, b) => b.fitScore - a.fitScore)[0];
  if (
    damageOpportunity.meaningful
    && strongestTacticalAlternative
    && !weapons.some(exploitsPrimaryWeakness)
  ) {
    weapons.push(strongestTacticalAlternative);
  }
  const selectedSubtypes = new Set(weapons.map((entry) => entry.item.subtype));
  for (const entry of rankedWeapons) {
    if (weapons.length >= 3) break;
    if (weapons.some((selected) => selected.item.id === entry.item.id)) continue;
    if (selectedSubtypes.has(entry.item.subtype)) continue;
    weapons.push(entry);
    selectedSubtypes.add(entry.item.subtype);
  }
  for (const entry of rankedWeapons) {
    if (weapons.length >= 3) break;
    if (!weapons.some((selected) => selected.item.id === entry.item.id)) weapons.push(entry);
  }
  const weapon = weapons[0];
  if (!weapon) return null;

  const attackProfile = resolveBossAttackProfile(markerId, npcParamId, bossName);
  const defenseFocus = attackProfile?.damage.slice(0, 3).map((entry) => entry.type) ?? ["Physical"];
  const context = { weapon, defenseFocus, style, twoHanded, access };
  const profile = weaponProfileById(weapon.profileId);
  const ashOfWar = profile ? recommendAshOfWar(profile, weapon, defenseFocus, style, access) : undefined;
  const linkedCounters = candidateKeys.flatMap((key) => {
    const item = itemFromKey(key);
    const duplicatesCore = item && (
      (item.category === "weapon" && item.id === weapon.item.id)
      || (ashOfWar && item.category === ashOfWar.item.category && item.id === ashOfWar.item.id)
    );
    return item && access(item).available && !duplicatesCore
      ? [{ item, reason: "gameTextLink" }]
      : [];
  }).slice(0, 2);
  const bossCounters = recommendBossCounters({
    markerId,
    attackProfile,
    stats: weapon.stats,
    access,
    reservedItems: linkedCounters,
  });
  const counterKeys = new Set(bossCounters.map((entry) => `${entry.item.category}:${entry.item.id}`));
  const withoutCounters = <T extends { item: { category: string; id: number } }>(entries: T[]): T[] =>
    entries.filter((entry) => !counterKeys.has(`${entry.item.category}:${entry.item.id}`));
  const talismans = withoutCounters(recommendTalismans(context)).slice(0, 4);
  const tears = withoutCounters(recommendTears(context)).slice(0, 2);
  const consumables = withoutCounters(recommendConsumables(context)).slice(0, 2);
  const spells = withoutCounters(recommendSpells(weapon, combat, level, access)).slice(0, 2);
  const offhand = twoHanded ? undefined : recommendOffhand(weapon, defenseFocus, style, access);
  const maximumLoad = maxEquipLoad(weapon.stats.end);
  const currentLoad = (weapon.item.weight ?? 0)
    + (offhand?.item.weight ?? 0)
    + talismans.reduce((sum, entry) => sum + (entry.item.weight ?? 0), 0);
  const progression = assessProgression({
    profile: progressionProfile,
    weapon,
    level,
    scadutreeLevel,
    weaponPerformanceRatio: bestFit > 0 ? weapon.fitScore / bestFit : 1,
  });

  return {
    weapon,
    alternatives: weapons.slice(1),
    talismans,
    tears,
    consumables,
    spirit: spiritAshAllowed ? recommendSpirit(weapon.stats, level, access) : undefined,
    ashOfWar,
    offhand,
    spells,
    bossCounters,
    defenseFocus,
    equipLoad: {
      current: currentLoad,
      maximum: maximumLoad,
      ratio: maximumLoad > 0 ? currentLoad / maximumLoad : 0,
    },
    progression,
    scadutree: scadutreeLevel == null ? undefined : scadutreeEffect(scadutreeLevel),
  };
};
