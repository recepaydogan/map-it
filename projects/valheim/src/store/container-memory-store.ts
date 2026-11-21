import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mergeContainerSnapshot } from '../lib/live-tracking/container-payload'
import type { LiveContainersSnapshot, RememberedContainer } from '../lib/live-tracking/container-types'

/**
 * Chests the tracking mod has reported, remembered per world across sessions.
 * The mod only sees loaded zones, so this is the app's long-term memory of
 * "which chest holds what"; a chest is forgotten only when the mod reports it
 * destroyed or the player clears the world's memory.
 */
interface ContainerMemoryState {
  worlds: Record<string, {
    worldName: string
    containers: Record<string, RememberedContainer>
    updatedAt: number
  }>
  /** World uid of the most recent snapshot, used when the game is not running. */
  lastWorldUid: string | null
  applySnapshot: (snapshot: LiveContainersSnapshot, now?: number) => void
  /**
   * Fills in chests the save file knows and the mod has not reported yet.
   * Live data always wins: an id already remembered is left untouched.
   */
  seedFromSave: (worldUid: string, worldName: string, containers: RememberedContainer[]) => void
  forgetWorld: (worldUid: string) => void
}

export const useContainerMemoryStore = create<ContainerMemoryState>()(
  persist(
    (set) => ({
      worlds: {},
      lastWorldUid: null,
      applySnapshot: (snapshot, now = Date.now()) => set((state) => {
        if (!snapshot.worldUid) return state
        const previous = state.worlds[snapshot.worldUid]
        const containers = mergeContainerSnapshot(previous?.containers ?? {}, snapshot, now)
        // Unchanged heartbeat: no new state, no re-render, no persist write.
        if (previous && containers === previous.containers && state.lastWorldUid === snapshot.worldUid) return state
        return {
          lastWorldUid: snapshot.worldUid,
          worlds: {
            ...state.worlds,
            [snapshot.worldUid]: {
              worldName: snapshot.worldName || previous?.worldName || '',
              containers,
              updatedAt: snapshot.updatedAt,
            },
          },
        }
      }),
      seedFromSave: (worldUid, worldName, containers) => set((state) => {
        const previous = state.worlds[worldUid]
        const next = { ...(previous?.containers ?? {}) }
        let added = 0
        for (const container of containers) {
          if (container.id in next) continue
          next[container.id] = container
          added += 1
        }
        if (added === 0) return state
        return {
          lastWorldUid: state.lastWorldUid ?? worldUid,
          worlds: {
            ...state.worlds,
            [worldUid]: {
              worldName: previous?.worldName || worldName,
              containers: next,
              updatedAt: previous?.updatedAt ?? 0,
            },
          },
        }
      }),
      forgetWorld: (worldUid) => set((state) => {
        const worlds = { ...state.worlds }
        delete worlds[worldUid]
        return { worlds, lastWorldUid: state.lastWorldUid === worldUid ? null : state.lastWorldUid }
      }),
    }),
    {
      name: 'valheim-companion:container-memory',
      // v2: chest ids are `prefab@x,y,z` (stable across world loads); the old
      // ZDO ids can never be matched again, so remembered worlds start over.
      version: 2,
      migrate: () => ({ worlds: {}, lastWorldUid: null }),
    },
  ),
)
