export type EnshroudedFact = { name: string; value: string };

export const isEffectFact = (fact: EnshroudedFact) => /^effects?\d*$/i.test(fact.name);
export const isDurationFact = (fact: EnshroudedFact) => /^duration$/i.test(fact.name);
