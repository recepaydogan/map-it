export type NativeCombatLootData = {
  native: { EntryDatas: { EnemyLevel: number; LootDusts: { MinDust: number; MaxDust: number; Probability: number; CycleDustMultipliers: number[] }[] }[] };
};
export type CurrencyBand = { firstLevel: number; lastLevel: number; min: number; max: number };

/** Describe authored amounts without choosing an encounter level or summing alternative rolls. */
export function combatCurrencySummary(data: NativeCombatLootData) {
  const bands: CurrencyBand[] = [];
  for (const row of [...data.native.EntryDatas].sort((a,b) => a.EnemyLevel-b.EnemyLevel)) {
    const amounts = row.LootDusts.filter(loot => Number.isFinite(loot.MinDust) && Number.isFinite(loot.MaxDust));
    if (!amounts.length) continue;
    const min = Math.min(...amounts.map(loot => loot.MinDust));
    const max = Math.max(...amounts.map(loot => loot.MaxDust));
    const previous = bands.at(-1);
    if (previous && previous.lastLevel + 1 === row.EnemyLevel && previous.min === min && previous.max === max) previous.lastLevel = row.EnemyLevel;
    else bands.push({ firstLevel: row.EnemyLevel, lastLevel: row.EnemyLevel, min, max });
  }
  if (!bands.length) return null;
  return { min: Math.min(...bands.map(band => band.min)), max: Math.max(...bands.map(band => band.max)), bands,
    varies: new Set(bands.map(band => `${band.min}:${band.max}`)).size > 1 };
}
