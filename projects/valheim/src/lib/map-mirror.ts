import type { GeneratedLocationMarker } from './valheim/location-generator'
import type { CharacterMapPin, MapPinType } from './valheim/character-save-format'
import type { RememberedContainer } from './live-tracking/container-types'
import type { NearbyCreature } from './live-tracking/creature-types'
import type { ExplorationRestriction } from './valheim/explored-map'

/**
 * What the desktop map is showing right now, handed to the in-game mini-map
 * as-is: same world, same marker source (save file or seed), same filters and
 * search. The mini-map mirrors this instead of recomputing it, so the two can
 * never drift apart. Windows of one Overwolf app share an origin, so a
 * BroadcastChannel reaches the other window directly.
 */
export interface MapMirrorState {
  seedName: string
  worldUid: string | null
  customMarkerWorldKey: string
  observedLocationsOnly?: boolean
  exploration?: ExplorationRestriction
  showUnexploredTerrain?: boolean
  markers: GeneratedLocationMarker[]
  visibleLocationIds: string[]
  playerPins: CharacterMapPin[]
  visiblePinTypes: MapPinType[]
  containers: RememberedContainer[]
  containersLive: boolean
  structurePaths: string[]
  nearbyCreatures: NearbyCreature[]
}

type Message =
  | { type: 'state'; state: MapMirrorState }
  | { type: 'request' }

const CHANNEL = 'valheim-companion:map-mirror'

const open = () => (typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL))

/** Desktop side: publishes every change and answers a mini-map that just opened. */
export function serveMapMirror(getState: () => MapMirrorState | null): { publish: () => void; close: () => void } {
  const channel = open()
  let heartbeat: ReturnType<typeof setTimeout> | undefined
  const publish = () => {
    clearTimeout(heartbeat)
    const state = getState()
    if (channel && state) channel.postMessage({ type: 'state', state } satisfies Message)
    // Only personal-exploration views need a lease. An overlay whose desktop
    // window closed can resume its own live reader instead of freezing the fog.
    if (channel && state?.exploration !== undefined) heartbeat = setTimeout(publish, 5000)
  }
  if (channel) channel.onmessage = (event: MessageEvent<Message>) => { if (event.data?.type === 'request') publish() }
  return { publish, close: () => { clearTimeout(heartbeat); channel?.close() } }
}

/** Mini-map side: asks for the current state and follows every update. */
export function followMapMirror(onState: (state: MapMirrorState) => void, onUnavailable?: () => void): () => void {
  const channel = open()
  if (!channel) return () => {}
  let lease: ReturnType<typeof setTimeout> | undefined
  channel.onmessage = (event: MessageEvent<Message>) => {
    if (event.data?.type !== 'state') return
    clearTimeout(lease)
    onState(event.data.state)
    if (onUnavailable && event.data.state.exploration !== undefined) lease = setTimeout(onUnavailable, 12_000)
  }
  channel.postMessage({ type: 'request' } satisfies Message)
  return () => { clearTimeout(lease); channel.close() }
}
