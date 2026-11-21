import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PlanTarget } from '../lib/crafting/recipe-types'

export const useCraftPreviewStore = create<{
  targets: PlanTarget[]
  includeChests: boolean
  setIncludeChests: (value: boolean) => void
  add: (prefabName: string) => void
  trackPlan: (planId: string, targets: PlanTarget[]) => void
  remove: (id: string) => void
  setQuantity: (id: string, quantity: number) => void
}>()(persist((set) => ({
  targets: [],
  includeChests: true,
  trackPlan: (planId, targets) => set((state) => {
    const incoming = targets.map((target) => ({ ...target, id: `plan:${planId}:${target.id}`, expandIntermediates: true, completed: false }))
    const ids = new Set(incoming.map((target) => target.id))
    return { targets: [...state.targets.filter((target) => !ids.has(target.id)), ...incoming] }
  }),
  setIncludeChests: (includeChests) => set({ includeChests }),
  add: (prefabName) => set((state) => ({ targets: [...state.targets, {
    id: crypto.randomUUID(), prefabName, quantity: 1, currentQuality: 0, targetQuality: 1,
    recipeId: null, expandIntermediates: true, note: '', completed: false,
  }] })),
  remove: (id) => set((state) => ({ targets: state.targets.filter((target) => target.id !== id) })),
  setQuantity: (id, quantity) => set((state) => ({ targets: state.targets.map((target) => target.id === id
    ? { ...target, quantity: Math.max(1, Math.min(999, Math.floor(quantity) || 1)) } : target) })),
}), { name: 'valheim-companion:multi-craft-preview' }))
