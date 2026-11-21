import { computeSpellDamage, catalystsFor, spellOptions } from "../../../data/er-spell-damage";
import { erItemByKey } from "../../../data/er-items-data";
import type { Combat } from "../../../data/combat";
import type { StatKey } from "../../../data/er-ar";
import { bossDamageMultiplier } from "./boss-profile";
import type {
  ItemAccessResolver,
  SpellRecommendation,
  WeaponRecommendation,
} from "./types";

const damageName: Record<string, string> = {
  physical: "Physical", magic: "Magic", fire: "Fire", lightning: "Lightning", holy: "Holy",
};

const upgradeForLevel = (level: number, max: number): number =>
  Math.min(max, Math.round(Math.min(25, Math.max(0, level / 6)) * max / 25));

export const recommendSpells = (
  weapon: WeaponRecommendation,
  combat: Combat,
  level: number,
  access: ItemAccessResolver,
): SpellRecommendation[] => {
  const stats: Record<StatKey, number> = {
    str: weapon.stats.str, dex: weapon.stats.dex, int: weapon.stats.int,
    fai: weapon.stats.fai, arc: weapon.stats.arc,
  };
  const candidates: { recommendation: SpellRecommendation; score: number }[] = [];
  for (const spell of spellOptions()) {
    if (!Object.keys(spell.base).length) continue;
    const spellItem = erItemByKey.get(spell.key);
    if (!spellItem || !access(spellItem).available) continue;
    for (const catalyst of catalystsFor(spell.type)) {
      const catalystItem = erItemByKey.get(`weapon:${catalyst.id}`);
      if (!catalystItem || !access(catalystItem).available) continue;
      const result = computeSpellDamage(spell.key, catalyst.id, upgradeForLevel(level, catalyst.max), stats);
      if (!result || result.unmet.length) continue;
      const adjusted = result.parts.reduce(
        (sum, part) => sum + part.total * bossDamageMultiplier(combat, damageName[part.type], []),
        0,
      );
      const score = adjusted / Math.max(1, spell.fp) * (spell.multiHit ? 0.9 : 1);
      candidates.push({
        score,
        recommendation: {
          item: spellItem,
          catalyst: catalystItem,
          damage: Math.round(adjusted),
          fp: spell.fp,
          reason: "spellEfficiency",
          detail: `${Math.round(adjusted)} / ${spell.fp} FP`,
        },
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const result: SpellRecommendation[] = [];
  const spellKeys = new Set<string>();
  for (const candidate of candidates) {
    if (spellKeys.has(candidate.recommendation.item.name)) continue;
    spellKeys.add(candidate.recommendation.item.name);
    result.push(candidate.recommendation);
    if (result.length === 2) break;
  }
  return result;
};
