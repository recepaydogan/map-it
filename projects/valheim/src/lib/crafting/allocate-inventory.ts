import { prefabKey } from './build-recipe-graph.ts'
import type { InventoryStock } from './recipe-types.ts'

/**
 * Rejects negative, fractional, and non-finite amounts at the domain boundary so
 * a corrupt snapshot or a hand-edited manual amount can never poison a plan.
 */
export function normalizeStock(raw: Readonly<Record<string, number>>): InventoryStock {
  const normalized: InventoryStock = {}
  for (const [prefabName, amount] of Object.entries(raw)) {
    if (!prefabName) continue
    if (!Number.isFinite(amount) || amount <= 0) continue
    const key = prefabKey(prefabName)
    normalized[key] = (normalized[key] ?? 0) + Math.floor(amount)
  }
  return normalized
}

export function mergeStock(...sources: Array<Readonly<Record<string, number>> | null | undefined>): InventoryStock {
  const merged: InventoryStock = {}
  for (const source of sources) {
    if (!source) continue
    for (const [prefabName, amount] of Object.entries(normalizeStock(source))) {
      merged[prefabName] = (merged[prefabName] ?? 0) + amount
    }
  }
  return merged
}

export interface StockPool {
  /** Consumes up to `amount` and returns how much was actually available. */
  take: (prefabName: string, amount: number) => number
  available: (prefabName: string) => number
  /** Amount consumed so far, keyed by lowercased prefab name. */
  consumed: () => InventoryStock
  /** What the pool started with. */
  initial: () => InventoryStock
}

/**
 * Owned materials are handed out once, in the order targets are listed. That is
 * what makes target priority meaningful and stops one stack from satisfying two
 * targets at the same time.
 */
export function createStockPool(stock: InventoryStock): StockPool {
  const initial = normalizeStock(stock)
  const remaining = new Map(Object.entries(initial))
  const used = new Map<string, number>()

  return {
    take(prefabName, amount) {
      if (!Number.isFinite(amount) || amount <= 0) return 0
      const key = prefabKey(prefabName)
      const availableAmount = remaining.get(key) ?? 0
      if (availableAmount <= 0) return 0
      const taken = Math.min(availableAmount, Math.floor(amount))
      remaining.set(key, availableAmount - taken)
      used.set(key, (used.get(key) ?? 0) + taken)
      return taken
    },
    available(prefabName) {
      return remaining.get(prefabKey(prefabName)) ?? 0
    },
    consumed() {
      return Object.fromEntries(used)
    },
    initial() {
      return { ...initial }
    },
  }
}
