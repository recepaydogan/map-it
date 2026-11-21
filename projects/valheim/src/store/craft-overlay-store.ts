import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const CRAFT_OVERLAY_KEY = 'valheim-companion:craft-overlay'

export const useCraftOverlayStore = create<{
  planId: string | null
  setPlanId: (planId: string | null) => void
}>()(persist((set) => ({
  planId: null,
  setPlanId: (planId) => set({ planId }),
}), { name: CRAFT_OVERLAY_KEY }))
