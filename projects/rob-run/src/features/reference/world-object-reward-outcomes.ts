import type { ReferenceRewardRate } from "./reference-types";

export interface ObjectRewardOutcome {
  percent: number;
  quantityMin: number;
  quantityMax: number;
  draws: number;
  faction?: string;
  contextKey?: string;
}

/** Merge identical faction distributions without dropping repeated reward checks. */
export function groupWorldObjectOutcomes(outcomes: ObjectRewardOutcome[]) {
  const groups: { factions: string[]; contextKey?: string; outcomes: ObjectRewardOutcome[] }[] = [];
  for (const outcome of outcomes) {
    let group = groups.find((candidate) => candidate.contextKey === outcome.contextKey
      && candidate.factions[0] === outcome.faction);
    if (!group) {
      group = { factions: outcome.faction ? [outcome.faction] : [], contextKey: outcome.contextKey, outcomes: [] };
      groups.push(group);
    }
    group.outcomes.push(outcome);
  }
  const signature = (rows: ObjectRewardOutcome[]) => JSON.stringify(rows.map((row) =>
    [row.quantityMin, row.quantityMax, row.percent, row.draws]).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b))));
  return groups.reduce<typeof groups>((merged, group) => {
    const match = group.factions.length ? merged.find((candidate) => candidate.factions.length
      && candidate.contextKey === group.contextKey && signature(candidate.outcomes) === signature(group.outcomes)) : undefined;
    if (match) match.factions.push(...group.factions);
    else merged.push(group);
    return merged;
  }, []);
}

export function singleWorldObjectOutcome(groups: ReturnType<typeof groupWorldObjectOutcomes>) {
  if (groups.length !== 1) return undefined;
  const outcomes = groups[0].outcomes;
  const guaranteed = outcomes.filter((outcome) => outcome.percent === 100);
  // Summarize a guaranteed base reward without displaying optional bonus checks.
  const outcome = outcomes.length === 1 ? outcomes[0] : guaranteed.length === 1 ? guaranteed[0] : undefined;
  return outcome?.draws === 1 && outcome.quantityMin === outcome.quantityMax ? outcome : undefined;
}

/** Shared distributions need no faction label; distinct ones retain their scope. */
export function visibleOutcomeFactions(factions: string[]) {
  return factions.length === 1 ? factions : [];
}

/** Package rates are independent triggers, not weights across packages. */
export function worldObjectRewardOutcomes(rates: ReferenceRewardRate[]): ObjectRewardOutcome[] {
  return rates.flatMap((rate) => {
    const outcome = (percent: number, draws: number): ObjectRewardOutcome => ({
      percent, draws, quantityMin: rate.quantityMin, quantityMax: rate.quantityMax,
      ...(rate.faction ? { faction: rate.faction } : {}),
      ...(rate.contextKey ? { contextKey: rate.contextKey } : {}),
    });
    if (rate.kind === "direct") return [outcome(rate.percent, 1)];
    if (rate.poolPercent === undefined || rate.poolCount === undefined) {
      throw new Error("World-object reward pool is missing its trigger rate or draw count.");
    }
    const guaranteed = Math.floor(rate.poolPercent / 100);
    const remainder = rate.poolPercent % 100;
    return [
      ...(guaranteed ? [outcome(rate.percent, guaranteed * rate.poolCount)] : []),
      ...(remainder ? [outcome(remainder * rate.percent / 100, rate.poolCount)] : []),
    ];
  });
}
