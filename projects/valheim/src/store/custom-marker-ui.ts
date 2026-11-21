import { create } from 'zustand'
import type { MarkerFields } from './custom-marker-store'

interface CustomMarkerUi {
  placing: boolean
  setPlacing: (placing: boolean) => void
  pending: MarkerFields | null
  beginPlacement: (fields: MarkerFields) => void
  selectedId: string | null
  select: (id: string | null) => void
}

export const useCustomMarkerUi = create<CustomMarkerUi>((set) => ({
  placing: false,
  pending: null,
  setPlacing: (placing) => set((state) => ({ placing, pending: placing ? state.pending : null })),
  beginPlacement: (pending) => set({ pending, placing: true }),
  selectedId: null,
  select: (selectedId) => set({ selectedId }),
}))
