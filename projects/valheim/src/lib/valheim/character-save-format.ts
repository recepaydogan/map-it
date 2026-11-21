import { BinaryReader } from './world-save-format.ts'
import { characterLayoutVersion, type CharacterCompatibility } from './character-compatibility.ts'
import { packExploredMap, type ExploredMap } from './explored-map.ts'

/** Minimap.PinType, in enum order (verified against the decompiled game). */
export type MapPinType =
  | 'icon0' | 'icon1' | 'icon2' | 'icon3' | 'death' | 'bed' | 'icon4'
  | 'shout' | 'none' | 'boss' | 'player' | 'randomEvent' | 'ping' | 'eventArea'
  | 'hildir1' | 'hildir2' | 'hildir3' | 'memorial' | 'unknown'

const PIN_TYPES: MapPinType[] = [
  'icon0', 'icon1', 'icon2', 'icon3', 'death', 'bed', 'icon4',
  'shout', 'none', 'boss', 'player', 'randomEvent', 'ping', 'eventArea',
  'hildir1', 'hildir2', 'hildir3', 'memorial',
]

/** Pin types a player places or the game persists on the player's behalf. */
export const PLAYER_VISIBLE_PIN_TYPES: ReadonlySet<MapPinType> = new Set<MapPinType>([
  'icon0', 'icon1', 'icon2', 'icon3', 'icon4', 'death', 'bed', 'boss', 'memorial',
])

export interface CharacterMapPin {
  name: string
  x: number
  z: number
  height: number
  type: MapPinType
  checked: boolean
  ownerId: string
}

export interface CharacterWorldData {
  worldUid: string
  pins: CharacterMapPin[]
  /** True when the save carried a map block at all. */
  hasMapData: boolean
  exploration?: ExploredMap | null
}

export interface CharacterSave {
  playerVersion: number
  playerName: string
  playerId: string
  worlds: Map<string, CharacterWorldData>
}

/**
 * Parses only the outer character package: stats, per-world spawn points and
 * the raw map-data blob per world, then the name/id. Map data is decoded lazily
 * by {@link decodeMapPins} because it needs async gzip inflation.
 */
export function parseCharacterFile(buffer: ArrayBuffer, compatibility: CharacterCompatibility | null = null): {
  playerVersion: number
  playerName: string
  playerId: string
  worlds: Array<{ worldUid: string; mapData: Uint8Array | null }>
} {
  const outer = new BinaryReader(new Uint8Array(buffer))
  const reader = outer.package()
  const playerVersion = reader.int32()
  const layoutVersion = characterLayoutVersion(playerVersion, compatibility)
  if (layoutVersion === 44 || layoutVersion >= 46) {
    const statCount = reader.int32()
    const groups = reader.int32()
    const skipStats = () => {
      const count = reader.int32()
      for (let i = 0; i < count; i++) { reader.skipString(); reader.single() }
    }
    for (let group = 0; group < groups; group++) {
      reader.skip(statCount * 4)
      for (let i = 0; i < 3; i++) skipStats()
      const enemyGroups = reader.int32()
      for (let i = 0; i < enemyGroups; i++) skipStats()
      for (let i = 0; i < 5; i++) skipStats()
    }
  } else if (layoutVersion >= 38) {
    const statCount = reader.int32()
    reader.skip(statCount * 4)
  } else if (layoutVersion >= 28) {
    reader.skip(16)
  }
  if (layoutVersion >= 40) reader.boolean()

  const worldCount = reader.int32()
  const worlds: Array<{ worldUid: string; mapData: Uint8Array | null }> = []
  for (let index = 0; index < worldCount; index += 1) {
    const worldUid = reader.int64().toString()
    reader.boolean() // haveCustomSpawnPoint
    reader.skip(12)
    reader.boolean() // haveLogoutPoint
    reader.skip(12)
    if (layoutVersion >= 30) {
      reader.boolean() // haveDeathPoint
      reader.skip(12)
    }
    reader.skip(12) // homePoint
    let mapData: Uint8Array | null = null
    if (layoutVersion >= 29 && reader.boolean()) {
      const length = reader.int32()
      mapData = new Uint8Array(length)
      for (let offset = 0; offset < length; offset += 1) mapData[offset] = reader.byte()
    }
    worlds.push({ worldUid, mapData })
  }
  const playerName = reader.string()
  const playerId = reader.int64().toString()
  return { playerVersion, playerName, playerId, worlds }
}

const inflateGzip = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([bytes as unknown as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * Decodes Minimap map data into pins. Layout (Minimap.GetMapData/SetMapData):
 * int32 MAPVERSION; when >= 7 the rest is `int32 len + gzip(inner)`; inner:
 * int32 textureSize, byte[ts*ts] explored, byte[ts*ts] exploredOthers (v>=5),
 * int32 pinCount, per pin string name, vec3 pos, int32 type, bool checked
 * (v>=3), int64 ownerId (v>=6), string author (v>=8); then bool publicRefPos.
 */
export async function decodeCharacterMap(mapData: Uint8Array): Promise<{ pins: CharacterMapPin[]; exploration: ExploredMap }> {
  const head = new BinaryReader(mapData)
  const version = head.int32()
  let reader: BinaryReader
  if (version >= 7) {
    const compressedLength = head.int32()
    const compressed = head.bytesOf(compressedLength)
    reader = new BinaryReader(await inflateGzip(compressed))
  } else {
    reader = new BinaryReader(mapData.subarray(head.position))
  }
  const textureSize = reader.int32()
  if (textureSize <= 0 || textureSize > 4096) throw new Error('Invalid explored map size')
  const explored = reader.bytesOf(textureSize * textureSize)
  if (version >= 5) reader.skip(textureSize * textureSize) // Cartography-table data is not personal exploration.
  const exploration = packExploredMap(textureSize, explored)
  if (version < 2) return { pins: [], exploration }
  const pinCount = reader.int32()
  const pins: CharacterMapPin[] = []
  for (let index = 0; index < pinCount; index += 1) {
    const name = reader.string()
    const x = reader.single()
    const height = reader.single()
    const z = reader.single()
    const typeIndex = reader.int32()
    const checked = version >= 3 ? reader.boolean() : false
    const ownerId = version >= 6 ? reader.int64().toString() : '0'
    if (version >= 8) reader.skipString()
    pins.push({
      name,
      x,
      z,
      height,
      type: PIN_TYPES[typeIndex] ?? 'unknown',
      checked,
      ownerId,
    })
  }
  return { pins, exploration }
}

export async function decodeMapPins(mapData: Uint8Array): Promise<CharacterMapPin[]> {
  return (await decodeCharacterMap(mapData)).pins
}

export async function loadCharacterSave(buffer: ArrayBuffer, compatibility: CharacterCompatibility | null = null): Promise<CharacterSave> {
  const parsed = parseCharacterFile(buffer, compatibility)
  const worlds = new Map<string, CharacterWorldData>()
  for (const world of parsed.worlds) {
    let pins: CharacterMapPin[] = []
    let exploration: ExploredMap | null = null
    if (world.mapData) {
      try {
        const decoded = await decodeCharacterMap(world.mapData)
        pins = decoded.pins
        exploration = decoded.exploration
      } catch (error) {
        console.warn('[Character save] Could not decode map pins', error)
      }
    }
    worlds.set(world.worldUid, { worldUid: world.worldUid, pins, exploration, hasMapData: world.mapData !== null })
  }
  return {
    playerVersion: parsed.playerVersion,
    playerName: parsed.playerName,
    playerId: parsed.playerId,
    worlds,
  }
}
