import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { clientLocationKey, type ClientLocationsSnapshot, type ClientLocation } from '../lib/live-tracking/client-locations.ts'

export interface ObservedWorld {
  worldUid: string
  worldName: string
  seedName: string
  locations: Record<string, ClientLocation>
}
interface State {
  worlds: Record<string, ObservedWorld>
  apply: (snapshot: ClientLocationsSnapshot) => void
}
export const useClientLocationStore = create<State>()(persist(set => ({
  worlds: {},
  apply: snapshot => set(state => {
    const previous = state.worlds[snapshot.worldUid]
    const sameWorld = previous?.worldName === snapshot.worldName && previous?.seedName === snapshot.seedName
    const locations = { ...(sameWorld ? previous.locations : {}) }
    let count = Object.keys(locations).length
    let changed = !sameWorld
    for (const observation of snapshot.locations) {
      const key = clientLocationKey(observation)
      const existing = locations[key]
      // Loaded proxy position takes precedence over the game's icon height.
      if (existing?.kind === 'loaded-proxy' && observation.kind === 'known-icon') continue
      if (JSON.stringify(existing) === JSON.stringify(observation)) continue
      if (!(key in locations)) {
        if (count >= 20_000) continue
        count++
      }
      locations[key] = observation
      changed = true
    }
    if (!changed) return state
    return { worlds: { ...state.worlds, [snapshot.worldUid]: {
      worldUid: snapshot.worldUid, worldName: snapshot.worldName, seedName: snapshot.seedName, locations,
    } } }
  }),
}), { name: 'valheim-companion:client-locations', version: 1 }))
