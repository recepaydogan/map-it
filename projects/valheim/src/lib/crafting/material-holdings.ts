import type { PlanCalculation } from './recipe-types'
import type { RememberedContainer } from '../live-tracking/container-types'

export interface MaterialHolding {
  inventory: number
  chests: Array<{ container: RememberedContainer; amount: number }>
}

/** Split the stock consumed by each tree row, without counting it twice. */
export function allocateMaterialHoldings(calculation: PlanCalculation | null, stock: Record<string, number>, containers: RememberedContainer[]) {
  const inventory = { ...stock }
  const chestPools = containers.map((container) => ({ container, stock: container.items.reduce<Record<string, number>>((result, item) => {
    const key = item.prefab.toLowerCase()
    result[key] = (result[key] ?? 0) + item.amount
    return result
  }, {}) }))
  const result = new Map<string, MaterialHolding>()
  const take = (prefab: string, amount: number): MaterialHolding => {
    const key = prefab.toLowerCase()
    const owned = Math.min(amount, inventory[key] ?? 0)
    inventory[key] = (inventory[key] ?? 0) - owned
    let remaining = amount - owned
    const chests: MaterialHolding['chests'] = []
    for (const pool of chestPools) {
      const used = Math.min(remaining, pool.stock[key] ?? 0)
      if (!used) continue
      pool.stock[key] -= used
      remaining -= used
      chests.push({ container: pool.container, amount: used })
    }
    return { inventory: owned, chests }
  }
  for (const target of calculation?.targets ?? []) {
    take(target.prefabName, target.ownedOutput)
    const walk = (nodes: typeof target.requirements) => {
      for (const node of nodes) {
        result.set(node.key, take(node.prefabName, node.fromStock))
        walk(node.children)
      }
    }
    walk(target.requirements)
  }
  return result
}
