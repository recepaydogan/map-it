import type { UpgradeStep } from "./intelligence-types";

/** Independent attempts with additive correction, retained level and constant per-attempt cost. */
export function attemptBudget(probability: number, correction: number, failures = 0) {
  if (![probability, correction].every(Number.isFinite) || probability <= 0 || probability > 1 || correction < 0
    || !Number.isSafeInteger(failures) || failures < 0) throw new Error("Invalid upgrade probability or correction state");
  const initial = Math.min(1, probability + failures * correction);
  if (!correction && initial < 1) return { expected: 1 / initial, maximum: null };
  const maximum = initial === 1 ? 1 : Math.ceil((1 - initial) / correction - 1e-10) + 1;
  if (maximum > 100001) throw new Error("Unsupported upgrade correction range");
  let survival = 1, expected = 0;
  for (let index = 0; index < maximum; index++) {
    expected += survival;
    survival *= 1 - Math.min(1, initial + index * correction);
  }
  return { expected, maximum };
}

export function upgradeBudget(steps: UpgradeStep[], from: number, to: number, failures: number) {
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to <= from || to - from > steps.length) return null;
  const selected = Array.from({ length: to - from }, (_, i) => steps.find(s => s.level === from + i));
  if (selected.some(s => !s || s.probability <= 0 || (s.penalty !== null && s.penalty !== 0) || !s.costsComplete)) return null;
  let gold = 0, maximumGold: number | null = 0, assumedPenalty = false;
  const materials = new Map<string, UpgradeStep["materials"][number] & { expected: number; maximum: number | null }>();
  const currencies = new Set(selected.map(s => s!.currency));
  if (currencies.size !== 1) return null;
  for (const [index, row] of selected.entries()) {
    const s = row!;
    const attempts = attemptBudget(s.probability, s.correction, index ? 0 : failures);
    gold += s.gold * attempts.expected;
    maximumGold = maximumGold === null || attempts.maximum === null ? null : maximumGold + s.gold * attempts.maximum;
    assumedPenalty ||= s.penalty === null;
    for (const cost of s.materials) {
      const key = `${cost.id}/${cost.level}`;
      const total = materials.get(key) ?? { ...cost, expected: 0, maximum: 0 };
      total.expected += cost.quantity * attempts.expected;
      total.maximum = total.maximum === null || attempts.maximum === null ? null : total.maximum + cost.quantity * attempts.maximum;
      materials.set(key, total);
    }
  }
  return { gold, maximumGold, currency: selected[0]!.currency, materials: [...materials.values()], assumedPenalty };
}
