import type { ReferenceRewardRate } from "../reference/reference-types";

export interface ChanceReward {
  rewardRates?: ReferenceRewardRate[];
  /** Native fixed-point chance, with 100,000,000 representing certainty. */
  probability?: number;
}

const validPercent = (value: number) => Number.isFinite(value) && value >= 0;
const atLeastOne = (chance: number, draws: number) => 1 - (1 - chance) ** draws;

function scenarioChance(rates: ReferenceRewardRate[]): number | undefined {
  const checks: (number | undefined)[] = [];
  const pools = new Map<string, ReferenceRewardRate[]>();
  for (const [index, rate] of rates.entries()) {
    if (rate.kind === "direct") {
      checks.push(validPercent(rate.percent) ? Math.min(1, rate.percent / 100) : undefined);
    } else {
      // Without a source pool ID, multiple rows cannot safely be summed.
      const key = rate.poolId ?? `unresolved:${index}`;
      pools.set(key, [...(pools.get(key) ?? []), rate]);
    }
  }
  for (const group of pools.values()) {
    const first = group[0];
    const { poolPercent, poolCount } = first;
    const choicePercent = group.reduce((sum, row) => sum + row.percent, 0);
    if (poolPercent === undefined || poolCount === undefined || !validPercent(poolPercent)
      || !Number.isInteger(poolCount) || poolCount < 1 || choicePercent > 100.001
      || group.some((row) => !validPercent(row.percent) || row.poolPercent !== poolPercent || row.poolCount !== poolCount)) {
      checks.push(undefined);
      continue;
    }
    const choiceChance = Math.min(1, choicePercent / 100);
    const guaranteedTriggers = Math.floor(poolPercent / 100);
    const extraTrigger = (poolPercent % 100) / 100;
    const missGuaranteed = (1 - choiceChance) ** (guaranteedTriggers * poolCount);
    const missExtra = 1 - extraTrigger * atLeastOne(choiceChance, poolCount);
    checks.push(1 - missGuaranteed * missExtra);
  }
  if (checks.some((chance) => chance === 1)) return 100;
  if (checks.some((chance) => chance === undefined)) return undefined;
  // Older catalogs lack pool identity. Keep ambiguous combined rates unranked.
  if (rates.length > 1 && rates.some((rate) => rate.kind === "pool" && !rate.poolId)) return undefined;
  return Math.round((1 - checks.reduce<number>((miss, chance) => miss * (1 - chance!), 1)) * 1e10) / 1e8;
}

/** Chance of receiving any amount, rather than the rarest quantity option. */
export function rewardDropChance(reward: ChanceReward): number | undefined {
  if (!reward.rewardRates?.length) return reward.probability !== undefined && validPercent(reward.probability)
    ? Math.min(100, reward.probability / 1_000_000) : undefined;
  const scenarios = new Map<string, ReferenceRewardRate[]>();
  for (const rate of reward.rewardRates) {
    const key = JSON.stringify([rate.contextKey, rate.faction, rate.levelMin, rate.levelMax]);
    scenarios.set(key, [...(scenarios.get(key) ?? []), rate]);
  }
  const chances = [...scenarios.values()].map(scenarioChance);
  // Conditional sources are alternatives. Use the highest known chance so an
  // uncommon faction/mode does not promote an otherwise common reward.
  return chances.some((chance) => chance === undefined) ? undefined : Math.max(...chances as number[]);
}
