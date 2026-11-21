import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { boundBaseWorlds, mergeBaseSnapshot, type BaseMemory, type BaseSnapshot } from '../lib/live-tracking/base-fallback.ts'

export const useBaseMemoryStore = create<{
  worlds: Record<string, BaseMemory>
  apply: (snapshot: BaseSnapshot) => void
}>()(persist((set) => ({
  worlds: {},
  apply: snapshot => set(state => {
    const previous = state.worlds[snapshot.worldUid]
    const next = mergeBaseSnapshot(previous, snapshot)
    if (previous === next) return state
    const worlds = boundBaseWorlds({ ...state.worlds, [snapshot.worldUid]: next })
    return { worlds }
  }),
}), { name: 'valheim-companion:base-memory', version: 1 }))
