import type { RewardBoxSummary, RewardBoxVariant } from "./reward-box-types";

/** A browsing heading groups names without merging the underlying box definitions. */
export function groupBoxListings(families: RewardBoxSummary[]) {
  const groups = new Map<string, RewardBoxSummary[]>();
  for (const family of families) {
    const key = JSON.stringify([family.name, family.technical]);
    const group = groups.get(key) ?? [];
    group.push(family);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export const boxCondition = (variant: RewardBoxVariant, field: string) =>
  variant.facts.find((fact) => fact.label === `reference.labels.${field}`)?.value;

export const boxVariantSignature = (variant: RewardBoxVariant) => JSON.stringify(variant.sections);

/** Collapse only identical content AND level rules; keep every source ID addressable. */
export function groupBoxVariants(variants: RewardBoxVariant[]) {
  const groups = new Map<string, RewardBoxVariant[]>();
  for (const variant of variants) {
    const key = JSON.stringify([boxVariantSignature(variant), boxCondition(variant, "minimum-level"), boxCondition(variant, "maximum-level")]);
    const group = groups.get(key) ?? [];
    group.push(variant);
    groups.set(key, group);
  }
  return [...groups.values()];
}
