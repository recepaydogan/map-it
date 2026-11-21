export interface CalculatorTalent {
  id: number;
  row: number;
  col: number;
  n: string;
  ic: number;
  ranks: number[];
  d: string[];
  pre: [number, number][];
  passive?: boolean;
  header?: string[][];
  requires?: string[];
}

export interface CalculatorTree {
  n: string;
  ic: number;
  talents: CalculatorTalent[];
}

export interface CalculatorClass {
  n: string;
  trees: CalculatorTree[];
}

export const MAX_TALENT_POINTS = 51;

const NUMBER_PATTERN = /\d+(?:[.,]\d+)?%?/g;
const UNIT_PATTERN = /^\s*(sec(?:onds?)?|yds?|yards?|Mana|Rage|Energy)\b/i;

export function nextRankNumberChanges(current: string, next: string): string | null {
  const currentNumbers = [...current.matchAll(NUMBER_PATTERN)];
  const nextNumbers = [...next.matchAll(NUMBER_PATTERN)];
  if (!currentNumbers.length || currentNumbers.length !== nextNumbers.length) return null;
  const changes = new Set<string>();
  currentNumbers.forEach((value, index) => {
    const following = nextNumbers[index]!;
    if (value[0] === following[0]) return;
    const unit = value[0].endsWith("%") ? "" : current.slice((value.index ?? 0) + value[0].length).match(UNIT_PATTERN)?.[1] ?? "";
    changes.add(`${value[0]}${unit ? ` ${unit}` : ""} → ${following[0]}${unit ? ` ${unit}` : ""}`);
  });
  return changes.size ? [...changes].join(" · ") : null;
}

export function talentCounts(order: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const id of order) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

export function treePoints(tree: CalculatorTree, counts: Map<number, number>): number {
  return tree.talents.reduce((sum, talent) => sum + (counts.get(talent.id) ?? 0), 0);
}

export function talentLockReason(tree: CalculatorTree, talent: CalculatorTalent, counts: Map<number, number>, total: number):
  | { kind: "points" }
  | { kind: "tier"; needed: number; current: number }
  | { kind: "prerequisite"; talent: CalculatorTalent; needed: number; current: number }
  | null {
  if (total >= MAX_TALENT_POINTS) return { kind: "points" };
  const lower = tree.talents.reduce((sum, candidate) => sum + (candidate.row < talent.row ? counts.get(candidate.id) ?? 0 : 0), 0);
  const needed = talent.row * 5;
  if (lower < needed) return { kind: "tier", needed, current: lower };
  for (const [id, rankIndex] of talent.pre) {
    const prerequisite = tree.talents.find((candidate) => candidate.id === id);
    if (prerequisite && (counts.get(id) ?? 0) < rankIndex + 1) {
      return { kind: "prerequisite", talent: prerequisite, needed: rankIndex + 1, current: counts.get(id) ?? 0 };
    }
  }
  return null;
}

function validAllocation(trees: CalculatorTree[], order: number[]): boolean {
  const counts = talentCounts(order);
  if (order.length > MAX_TALENT_POINTS) return false;
  return trees.every((tree) => tree.talents.every((talent) => {
    const ranks = counts.get(talent.id) ?? 0;
    if (ranks > talent.ranks.length) return false;
    if (!ranks) return true;
    const lower = tree.talents.reduce((sum, candidate) => sum + (candidate.row < talent.row ? counts.get(candidate.id) ?? 0 : 0), 0);
    return lower >= talent.row * 5 && talent.pre.every(([id, rankIndex]) => (counts.get(id) ?? 0) >= rankIndex + 1);
  }));
}

export function restoreTalentOrder(trees: CalculatorTree[], value: unknown): number[] {
  if (!Array.isArray(value) || !value.every((id) => typeof id === "number" && Number.isInteger(id))) return [];
  const ids = new Set(trees.flatMap((tree) => tree.talents.map((talent) => talent.id)));
  if (!value.every((id) => ids.has(id))) return [];
  return validAllocation(trees, value) ? value : [];
}

export function changeTalentRank(trees: CalculatorTree[], order: number[], id: number, direction: 1 | -1): number[] {
  const tree = trees.find((candidate) => candidate.talents.some((talent) => talent.id === id));
  const talent = tree?.talents.find((candidate) => candidate.id === id);
  if (!tree || !talent || !talent.ranks.length || talent.n === "Unknown talent") return order;
  const counts = talentCounts(order);
  const current = counts.get(id) ?? 0;
  if (direction === 1) {
    if (current >= talent.ranks.length || talentLockReason(tree, talent, counts, order.length)) return order;
    return [...order, id];
  }
  if (!current) return order;
  const index = order.lastIndexOf(id);
  const next = [...order.slice(0, index), ...order.slice(index + 1)];
  return validAllocation(trees, next) ? next : order;
}

export function resetTalentTree(tree: CalculatorTree, order: number[]): number[] {
  const ids = new Set(tree.talents.map((talent) => talent.id));
  return order.filter((id) => !ids.has(id));
}

export interface TalentOrderGroup {
  id: number;
  name: string;
  icon: number;
  tree: string;
  maxRank: number;
  from: number;
  to: number;
  rankFrom: number;
  rankTo: number;
}

export function talentOrderGroups(trees: CalculatorTree[], order: number[]): TalentOrderGroup[] {
  const talents = new Map(trees.flatMap((tree) => tree.talents.map((talent) => [talent.id, { talent, tree: tree.n }] as const)));
  const ranks = new Map<number, number>();
  const groups: TalentOrderGroup[] = [];
  order.forEach((id, index) => {
    const entry = talents.get(id);
    if (!entry) return;
    const level = index + 10;
    const rank = (ranks.get(id) ?? 0) + 1;
    ranks.set(id, rank);
    const last = groups.at(-1);
    if (last?.id === id) {
      last.to = level;
      last.rankTo = rank;
    } else {
      groups.push({ id, name: entry.talent.n, icon: entry.talent.ic, tree: entry.tree,
        maxRank: entry.talent.ranks.length, from: level, to: level, rankFrom: rank, rankTo: rank });
    }
  });
  return groups;
}
