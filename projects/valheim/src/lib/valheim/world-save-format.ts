import { getStableHashCode } from './stable-hash.ts'
import type {
  SavedBaseOperations,
  SavedContainer,
  SavePrefabType,
  SaveResourceNodes,
  SaveResourceState,
  ValheimWorldDatabase,
  ValheimWorldSave,
} from '../../types/world-save.ts'
import { clusterPlayerStructures, type PlayerStructurePoint } from './structure-clustering.ts'
import { StructureGeometryBuilder } from './structure-geometry.ts'
import { buildStructureMapPaths } from './structure-map-paths.ts'

export class BinaryReader {
  private readonly bytes: Uint8Array
  private readonly view: DataView
  private readonly decoder = new TextDecoder()
  position = 0

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  get remaining(): number {
    return this.bytes.byteLength - this.position
  }

  private require(size: number): void {
    if (!Number.isSafeInteger(size) || size < 0 || this.position + size > this.bytes.byteLength) {
      throw new Error(`Unexpected end of Valheim save at byte ${this.position}`)
    }
  }

  skip(size: number): void {
    this.require(size)
    this.position += size
  }

  bytesOf(size: number): Uint8Array {
    this.require(size)
    const bytes = this.bytes.subarray(this.position, this.position + size)
    this.position += size
    return bytes
  }

  smallRotationYaw(): number {
    const high = this.uint16()
    if ((high & 0x8000) !== 0) return (high & 0x7fff) * 0.5
    const packed = ((high << 16) | this.uint16()) >>> 0
    return ((packed >>> 10) & 0x3ff) * 0.5
  }

  byte(): number {
    this.require(1)
    return this.view.getUint8(this.position++)
  }

  boolean(): boolean {
    return this.byte() !== 0
  }

  int16(): number {
    this.require(2)
    const value = this.view.getInt16(this.position, true)
    this.position += 2
    return value
  }

  uint16(): number {
    this.require(2)
    const value = this.view.getUint16(this.position, true)
    this.position += 2
    return value
  }

  int32(): number {
    this.require(4)
    const value = this.view.getInt32(this.position, true)
    this.position += 4
    return value
  }

  uint32(): number {
    this.require(4)
    const value = this.view.getUint32(this.position, true)
    this.position += 4
    return value
  }

  int64(): bigint {
    this.require(8)
    const value = this.view.getBigInt64(this.position, true)
    this.position += 8
    return value
  }

  single(): number {
    this.require(4)
    const value = this.view.getFloat32(this.position, true)
    this.position += 4
    return value
  }

  double(): number {
    this.require(8)
    const value = this.view.getFloat64(this.position, true)
    this.position += 8
    return value
  }

  private sevenBitInt(): number {
    let result = 0
    for (let shift = 0; shift < 35; shift += 7) {
      const value = this.byte()
      result |= (value & 0x7f) << shift
      if ((value & 0x80) === 0) return result
    }
    throw new Error('Invalid .NET string length in Valheim save')
  }

  string(): string {
    const length = this.sevenBitInt()
    this.require(length)
    const value = this.decoder.decode(
      this.bytes.subarray(this.position, this.position + length),
    )
    this.position += length
    return value
  }

  skipString(): void {
    this.skip(this.sevenBitInt())
  }

  numItems(version: number): number {
    if (version < 33) return this.byte()
    const first = this.byte()
    return (first & 0x80) !== 0
      ? ((first & 0x7f) << 8) | this.byte()
      : first
  }

  package(): BinaryReader {
    const size = this.int32()
    this.require(size)
    const packageReader = new BinaryReader(
      this.bytes.subarray(this.position, this.position + size),
    )
    this.position += size
    return packageReader
  }
}

export function parseWorldMetadata(
  buffer: ArrayBuffer,
  fwlPath: string,
  databasePath: string | null,
  source: ValheimWorldSave['source'],
): ValheimWorldSave {
  const reader = new BinaryReader(new Uint8Array(buffer)).package()
  const worldVersion = reader.int32()
  const name = reader.string()
  const seedName = reader.string()
  const seed = reader.int32()
  const uid = reader.int64().toString()
  const worldGenVersion = worldVersion >= 26 ? reader.int32() : 0
  const needsDatabase = worldVersion >= 30 ? reader.boolean() : false
  const fileName = fwlPath.split(/[\\/]/).pop()?.replace(/\.fwl2?$/i, '') ?? name

  return {
    id: fwlPath.toLowerCase(),
    fileName,
    name,
    seedName,
    seed,
    uid,
    worldVersion,
    worldGenVersion,
    needsDatabase,
    fwlPath,
    databasePath,
    worldTimeSeconds: null,
    source,
  }
}

/** Reads only the fixed-size database header used for automatic world selection. */
export function parseWorldTimeSeconds(buffer: ArrayBufferLike): number | null {
  const reader = new BinaryReader(new Uint8Array(buffer))
  const databaseVersion = reader.int32()
  if (databaseVersion < 4) return null
  const seconds = reader.double()
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

const ZDO_KEYS = [
  'picked',
  'picked_time',
  'items',
  'addedDefaultItems',
  'spawn_time',
  'health',
  'level',
  'creator',
  'tag',
  'tagauthor',
  'fuel',
  'queued',
  'product',
  'Content',
  'content',
  'bakeTimer',
  'StartTime',
  'lastTime',
  'spawnOre',
  'spawnAmount',
  ...Array.from({ length: 32 }, (_, index) => `item${index}`),
  ...Array.from({ length: 32 }, (_, index) => `slot${index}`),
  ...Array.from({ length: 32 }, (_, index) => `slotstatus${index}`),
].reduce<Map<number, string>>((result, key) => {
  result.set(getStableHashCode(key), key)
  return result
}, new Map())

/** Player-placed storage pieces worth lifting out of the save. */
export const CONTAINER_PREFABS = new Set([
  'piece_chest_wood', 'piece_chest', 'piece_chest_private', 'piece_chest_blackmetal', 'piece_chest_barrel',
])

export const PORTAL_PREFABS = new Set([
  'portal', 'portal_stone', 'portal_wood',
])

export const PRODUCTION_PREFABS = new Set([
  'blastfurnace',
  'charcoal_kiln',
  'eitrrefinery',
  'fermenter',
  'piece_beehive',
  'piece_cookingstation',
  'piece_cookingstation_iron',
  'piece_oven',
  'piece_sapcollector',
  'piece_spinningwheel',
  'smelter',
  'windmill',
])
const HASH_CREATOR = getStableHashCode('creator')
const HASH_ITEMS = getStableHashCode('items')
const HASH_PICKED = getStableHashCode('picked')
const HASH_PICKED_TIME = getStableHashCode('picked_time')
const HASH_HEALTH = getStableHashCode('health')
const HASH_ENABLED = getStableHashCode('enabled')

/** ZNet.GetTime multiplies the world clock (seconds) by 1000 * 10000. */
export const GAME_TICKS_PER_SECOND = 10_000_000

/**
 * Component kinds whose prefabs are harvestable world objects. Their ZDOs are
 * retained in compact columnar form instead of the per-object record used for
 * characters and dropped items, because a world can hold hundreds of thousands
 * of them.
 */
export const RESOURCE_COMPONENT_KINDS = new Set([
  'pickable',
  'pickable-item',
  'mine-rock',
  'tree',
  'tree-log',
  'drop-on-destroyed',
  'destructible',
])

class ResourceNodeBuilder {
  private capacity = 4096
  count = 0
  private prefabHashes = new Int32Array(this.capacity)
  private x = new Float32Array(this.capacity)
  private z = new Float32Array(this.capacity)
  private picked = new Uint8Array(this.capacity)
  private pickedTimeTicks = new Float64Array(this.capacity)
  private damaged = new Uint8Array(this.capacity)
  private disabled = new Uint8Array(this.capacity)

  private grow(): void {
    this.capacity *= 2
    const copy = <T extends Int32Array | Float32Array | Float64Array | Uint8Array>(
      source: T,
      target: T,
    ): T => {
      target.set(source as never)
      return target
    }
    this.prefabHashes = copy(this.prefabHashes, new Int32Array(this.capacity))
    this.x = copy(this.x, new Float32Array(this.capacity))
    this.z = copy(this.z, new Float32Array(this.capacity))
    this.picked = copy(this.picked, new Uint8Array(this.capacity))
    this.pickedTimeTicks = copy(this.pickedTimeTicks, new Float64Array(this.capacity))
    this.damaged = copy(this.damaged, new Uint8Array(this.capacity))
    this.disabled = copy(this.disabled, new Uint8Array(this.capacity))
  }

  push(
    prefabHash: number,
    x: number,
    z: number,
    picked: boolean,
    pickedTimeTicks: number,
    damaged: boolean,
    disabled: boolean,
  ): void {
    if (this.count === this.capacity) this.grow()
    const index = this.count
    this.prefabHashes[index] = prefabHash
    this.x[index] = x
    this.z[index] = z
    this.picked[index] = picked ? 1 : 0
    this.pickedTimeTicks[index] = pickedTimeTicks
    this.damaged[index] = damaged ? 1 : 0
    this.disabled[index] = disabled ? 1 : 0
    this.count += 1
  }

  build(): SaveResourceNodes {
    return {
      count: this.count,
      prefabHashes: this.prefabHashes.slice(0, this.count),
      x: this.x.slice(0, this.count),
      z: this.z.slice(0, this.count),
      picked: this.picked.slice(0, this.count),
      pickedTimeTicks: this.pickedTimeTicks.slice(0, this.count),
      damaged: this.damaged.slice(0, this.count),
      disabled: this.disabled.slice(0, this.count),
    }
  }
}

type ValueKind = 'float' | 'vector' | 'quaternion' | 'int' | 'long' | 'string' | 'bytes'

function readValue(reader: BinaryReader, kind: ValueKind): unknown {
  if (kind === 'float') return reader.single()
  if (kind === 'vector') return [reader.single(), reader.single(), reader.single()]
  if (kind === 'quaternion') {
    return [reader.single(), reader.single(), reader.single(), reader.single()]
  }
  if (kind === 'int') return reader.int32()
  if (kind === 'long') return reader.int64().toString()
  if (kind === 'string') return reader.string()
  const length = reader.int32()
  reader.skip(length)
  return { byteLength: length }
}

function readValueMap(
  reader: BinaryReader,
  version: number,
  kind: ValueKind,
  retain: boolean,
  target: Record<string, unknown>,
): void {
  const count = reader.numItems(version)
  for (let index = 0; index < count; index += 1) {
    const keyHash = reader.int32()
    const value = readValue(reader, kind)
    if (retain) target[ZDO_KEYS.get(keyHash) ?? String(keyHash)] = value
  }
}

interface PrefabLookupEntry {
  prefabName: string
  componentKinds: string[]
  pieceMaterial?: string
  pieceBounds?: { min: [number, number, number]; max: [number, number, number] } | null
  retainPosition: boolean
  retainResource: boolean
  retainContainer: boolean
  retainPiece: boolean
  retainPortal: boolean
  retainProduction: boolean
}

function buildPrefabLookup(prefabs: SavePrefabType[]): Map<number, PrefabLookupEntry> {
  return new Map(prefabs.map((prefab) => {
    const retainPosition = prefab.componentKinds.some((kind) =>
      ['character', 'item-drop', 'trader'].includes(kind),
    )
    const retainResource = !retainPosition &&
      prefab.componentKinds.some((kind) => RESOURCE_COMPONENT_KINDS.has(kind))
    const retainContainer = CONTAINER_PREFABS.has(prefab.prefabName) || prefab.componentKinds.includes('container')
    const retainPiece = prefab.componentKinds.includes('piece')
    const retainPortal = PORTAL_PREFABS.has(prefab.prefabName)
    const retainProduction = PRODUCTION_PREFABS.has(prefab.prefabName) || prefab.componentKinds.includes('conversion')
    return [getStableHashCode(prefab.prefabName), {
      ...prefab,
      retainPosition,
      retainResource,
      retainContainer,
      retainPiece,
      retainPortal,
      retainProduction,
    }]
  }))
}

interface OperationValueMaps {
  floats: Record<string, unknown>
  ints: Record<string, unknown>
  longs: Record<string, unknown>
  strings: Record<string, unknown>
}

function numericProperty(properties: OperationValueMaps, key: string): number {
  const value = properties.floats[key] ?? properties.ints[key] ?? properties.longs[key]
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value)
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function stringProperty(properties: OperationValueMaps, key: string): string {
  const value = properties.strings[key]
  return typeof value === 'string' ? value : ''
}

function integerStringProperty(properties: OperationValueMaps, key: string): string {
  const value = properties.longs[key] ?? properties.ints[key]
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return value
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.trunc(value)) : '0'
}

function scanOperationValueMaps(
  reader: BinaryReader,
  version: number,
  flags: number,
): OperationValueMaps {
  const properties: OperationValueMaps = { floats: {}, ints: {}, longs: {}, strings: {} }
  const skipped: Record<string, unknown> = {}
  if ((flags & 2) !== 0) readValueMap(reader, version, 'float', true, properties.floats)
  if ((flags & 4) !== 0) readValueMap(reader, version, 'vector', false, skipped)
  if ((flags & 8) !== 0) readValueMap(reader, version, 'quaternion', false, skipped)
  if ((flags & 0x10) !== 0) readValueMap(reader, version, 'int', true, properties.ints)
  if ((flags & 0x20) !== 0) readValueMap(reader, version, 'long', true, properties.longs)
  if ((flags & 0x40) !== 0) readValueMap(reader, version, 'string', true, properties.strings)
  if ((flags & 0x80) !== 0) readValueMap(reader, version, 'bytes', false, skipped)
  return properties
}

/**
 * Reads the seven typed value maps of one resource-node ZDO, keeping only the
 * fields the loot-state model needs. Values are skipped in place instead of
 * being materialised, which is what keeps a million-object save parseable.
 */
function scanResourceValueMaps(
  reader: BinaryReader,
  version: number,
  flags: number,
  out: { picked: boolean; pickedTimeTicks: number; damaged: boolean; disabled: boolean },
): void {
  if ((flags & 2) !== 0) {
    const count = reader.numItems(version)
    for (let index = 0; index < count; index += 1) {
      const keyHash = reader.int32()
      reader.single()
      if (keyHash === HASH_HEALTH) out.damaged = true
    }
  }
  if ((flags & 4) !== 0) {
    const count = reader.numItems(version)
    for (let index = 0; index < count; index += 1) {
      reader.int32()
      reader.skip(12)
    }
  }
  if ((flags & 8) !== 0) {
    const count = reader.numItems(version)
    for (let index = 0; index < count; index += 1) {
      reader.int32()
      reader.skip(16)
    }
  }
  if ((flags & 0x10) !== 0) {
    const count = reader.numItems(version)
    for (let index = 0; index < count; index += 1) {
      const keyHash = reader.int32()
      const value = reader.int32()
      if (keyHash === HASH_PICKED) out.picked = value !== 0
      else if (keyHash === HASH_ENABLED) out.disabled = value === 0
    }
  }
  if ((flags & 0x20) !== 0) {
    const count = reader.numItems(version)
    for (let index = 0; index < count; index += 1) {
      const keyHash = reader.int32()
      const value = reader.int64()
      if (keyHash === HASH_PICKED_TIME) out.pickedTimeTicks = Number(value)
    }
  }
  if ((flags & 0x40) !== 0) {
    const count = reader.numItems(version)
    for (let index = 0; index < count; index += 1) {
      const keyHash = reader.int32()
      reader.skipString()
      // MineRock5 stores its per-area damage package under the health key as a
      // string, so its presence alone marks a partially mined deposit.
      if (keyHash === HASH_HEALTH) out.damaged = true
    }
  }
  if ((flags & 0x80) !== 0) {
    const count = reader.numItems(version)
    for (let index = 0; index < count; index += 1) {
      reader.int32()
      reader.skip(reader.int32())
    }
  }
}

/**
 * Inventory.Save's package, as the "items" string of a container ZDO holds it
 * (base64). Versions 100–106 are read; only name, stack and quality are kept.
 */
export function decodeInventoryItems(base64: string, prefabs: ReadonlyMap<number, { prefabName: string }> = new Map()): SavedContainer['items'] {
  if (!base64) return []
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  const reader = new BinaryReader(bytes)
  const version = reader.int32()
  if (version > 109) throw new Error(`Unsupported inventory version ${version}`)
  const count = version >= 108 ? reader.uint16() : reader.int32()
  const items: SavedContainer['items'] = []
  for (let index = 0; index < count; index += 1) {
    if (version >= 108) {
      reader.int32() // durability in hundredths
      reader.skip(3) // grid x, y, world level
      const flags = reader.byte()
      const quality = (flags & 4) ? reader.uint16() : 1
      const stack = (flags & 8) ? reader.uint16() : 1
      if (flags & 16) reader.int32()
      if (flags & 32) { reader.int64(); reader.skipString() }
      const hash = (flags & 64) ? reader.int32() : 0
      const customCount = (flags & 128) ? reader.numItems(33) : 0
      for (let custom = 0; custom < customCount; custom++) { reader.skipString(); reader.skipString() }
      if (version >= 109) reader.byte()
      if (hash) items.push({ prefab: prefabs.get(hash)?.prefabName ?? `Unknown_${hash}`, amount: stack, quality })
      continue
    }
    const name = reader.string()
    const stack = reader.int32()
    reader.single() // durability
    reader.int32(); reader.int32() // grid position
    reader.boolean() // equipped
    let quality = 1
    if (version >= 101) quality = reader.int32()
    if (version >= 102) reader.int32() // variant
    if (version >= 103) { reader.int64(); reader.skipString() } // crafter id + name
    if (version >= 104) {
      const customCount = reader.int32()
      for (let custom = 0; custom < customCount; custom += 1) { reader.skipString(); reader.skipString() }
    }
    if (version >= 105) reader.int32() // world level
    if (version >= 106) reader.boolean() // picked up
    if (version === 107) reader.boolean() // cheated
    if (name) items.push({ prefab: name, amount: stack, quality })
  }
  return items
}

/** The creator and item package of a container ZDO; every other value is skipped. */
function scanContainerValueMaps(
  reader: BinaryReader,
  version: number,
  flags: number,
  out: { creator: string; items: string },
): void {
  if ((flags & 2) !== 0) { const n = reader.numItems(version); for (let i = 0; i < n; i += 1) { reader.int32(); reader.single() } }
  if ((flags & 4) !== 0) { const n = reader.numItems(version); for (let i = 0; i < n; i += 1) { reader.int32(); reader.skip(12) } }
  if ((flags & 8) !== 0) { const n = reader.numItems(version); for (let i = 0; i < n; i += 1) { reader.int32(); reader.skip(16) } }
  if ((flags & 0x10) !== 0) { const n = reader.numItems(version); for (let i = 0; i < n; i += 1) { reader.int32(); reader.int32() } }
  if ((flags & 0x20) !== 0) {
    const n = reader.numItems(version)
    for (let i = 0; i < n; i += 1) {
      const key = reader.int32()
      const value = reader.int64()
      if (key === HASH_CREATOR) out.creator = value.toString()
    }
  }
  if ((flags & 0x40) !== 0) {
    const n = reader.numItems(version)
    for (let i = 0; i < n; i += 1) {
      const key = reader.int32()
      if (key === HASH_ITEMS) out.items = reader.string()
      else reader.skipString()
    }
  }
  if ((flags & 0x80) !== 0) { const n = reader.numItems(version); for (let i = 0; i < n; i += 1) { reader.int32(); reader.skip(reader.int32()) } }
}

/** Reads only Piece.m_creator and skips every other ZDO property in place. */
function scanPieceCreator(
  reader: BinaryReader,
  version: number,
  flags: number,
): string {
  let creator = '0'
  if ((flags & 2) !== 0) { const n = reader.numItems(version); for (let i = 0; i < n; i += 1) { reader.int32(); reader.single() } }
  if ((flags & 4) !== 0) { const n = reader.numItems(version); for (let i = 0; i < n; i += 1) { reader.int32(); reader.skip(12) } }
  if ((flags & 8) !== 0) { const n = reader.numItems(version); for (let i = 0; i < n; i += 1) { reader.int32(); reader.skip(16) } }
  if ((flags & 0x10) !== 0) { const n = reader.numItems(version); for (let i = 0; i < n; i += 1) { reader.int32(); reader.int32() } }
  if ((flags & 0x20) !== 0) {
    const n = reader.numItems(version)
    for (let i = 0; i < n; i += 1) {
      const key = reader.int32()
      const value = reader.int64()
      if (key === HASH_CREATOR) creator = value.toString()
    }
  }
  if ((flags & 0x40) !== 0) { const n = reader.numItems(version); for (let i = 0; i < n; i += 1) { reader.int32(); reader.skipString() } }
  if ((flags & 0x80) !== 0) { const n = reader.numItems(version); for (let i = 0; i < n; i += 1) { reader.int32(); reader.skip(reader.int32()) } }
  return creator
}

export function parseWorldDatabase(
  buffer: ArrayBuffer,
  prefabs: SavePrefabType[],
  chunked?: { objects: ArrayBuffer; objectCount: number; zones: ArrayBuffer; locationNames: Record<number, string> },
): ValheimWorldDatabase {
  let reader = new BinaryReader(new Uint8Array(buffer))
  const databaseVersion = reader.int32()
  if (databaseVersion < 31 || databaseVersion > 42 || (databaseVersion >= 40 && !chunked)) {
    throw new Error(`Unsupported Valheim database version ${databaseVersion}`)
  }

  const netTimeSeconds = databaseVersion >= 4 ? reader.double() : 0
  if (!chunked) { reader.int64(); reader.uint32() }
  else reader = new BinaryReader(new Uint8Array(chunked.objects))

  const prefabLookup = buildPrefabLookup(prefabs)
  const prefabCounts: Record<string, number> = {}
  const trackedObjects: ValheimWorldDatabase['trackedObjects'] = []
  const containers: ValheimWorldDatabase['containers'] = []
  const playerStructurePoints: PlayerStructurePoint[] = []
  const structureGeometry = new StructureGeometryBuilder()
  const containerScratch = { creator: '0', items: '' }
  const resourceNodes = new ResourceNodeBuilder()
  const resourceScratch = { picked: false, pickedTimeTicks: 0, damaged: false, disabled: false }
  const baseOperations: SavedBaseOperations = { portals: [], stations: [] }
  const objectCount = chunked?.objectCount ?? reader.int32()

  for (let objectIndex = 0; objectIndex < objectCount; objectIndex += 1) {
    const flags = reader.uint16()
    if (!chunked) { reader.int16(); reader.int16() }
    const small = (flags & 0x2000) !== 0
    const x = small ? reader.int16() : reader.single()
    const height = small ? 0 : reader.single()
    const y = small ? reader.int16() : reader.single()
    const prefabHash = reader.int32()
    const prefab = prefabLookup.get(prefabHash)

    if (prefab) {
      prefabCounts[prefab.prefabName] = (prefabCounts[prefab.prefabName] ?? 0) + 1
    }
    let yaw = 0
    if ((flags & 0x1000) !== 0) {
      if (chunked) yaw = reader.smallRotationYaw()
      else { reader.single(); yaw = reader.single(); reader.single() }
    }
    let connectionType: number | null = null
    let connectionHash: number | null = null
    if ((flags & 1) !== 0) {
      connectionType = reader.byte()
      connectionHash = reader.int32()
    }

    if (prefab?.retainPortal || prefab?.retainProduction) {
      const properties = scanOperationValueMaps(reader, databaseVersion, flags)
      const creator = integerStringProperty(properties, 'creator')
      if (creator !== '0') {
        playerStructurePoints.push({ x, z: y })
        structureGeometry.push({
          prefabName: prefab.prefabName,
          material: prefab.pieceMaterial,
          bounds: prefab.pieceBounds,
          x,
          z: y,
          yaw,
        })
        if (prefab.retainPortal) {
          baseOperations.portals.push({
            prefabName: prefab.prefabName,
            x,
            y,
            height,
            yaw,
            creator,
            tag: stringProperty(properties, 'tag'),
            author: stringProperty(properties, 'tagauthor'),
            connectionType,
            connectionHash,
          })
        } else {
          const smelterItems = Array.from({ length: 32 }, (_, index) =>
            stringProperty(properties, `item${index}`),
          ).filter(Boolean)
          const cookingSlots = Array.from({ length: 32 }, (_, index) => ({
            item: stringProperty(properties, `slot${index}`),
            status: numericProperty(properties, `slotstatus${index}`),
            cookTime: numericProperty(properties, `slot${index}`),
          })).filter((slot) => slot.item)
          const queueItems = [...smelterItems, ...cookingSlots.map((slot) => slot.item)]
          const slotStatuses = cookingSlots.map((slot) => slot.status)
          const slotCookTimes = cookingSlots.map((slot) => slot.cookTime)
          baseOperations.stations.push({
            prefabName: prefab.prefabName,
            x,
            y,
            height,
            creator,
            fuel: numericProperty(properties, 'fuel'),
            queued: numericProperty(properties, 'queued'),
            level: numericProperty(properties, 'level'),
            productProgress: numericProperty(properties, 'product'),
            processedOutputPrefab: stringProperty(properties, 'spawnOre'),
            processedOutputAmount: numericProperty(properties, 'spawnAmount'),
            content: stringProperty(properties, 'Content') || stringProperty(properties, 'content'),
            bakeTimer: numericProperty(properties, 'bakeTimer'),
            startTimeTicks: numericProperty(properties, 'StartTime'),
            lastTimeTicks: numericProperty(properties, 'lastTime'),
            queueItems,
            slotStatuses,
            slotCookTimes,
          })
        }
      }
      continue
    }

    if (prefab?.retainContainer) {
      containerScratch.creator = '0'
      containerScratch.items = ''
      scanContainerValueMaps(reader, databaseVersion, flags, containerScratch)
      let items: SavedContainer['items'] = []
      try { items = decodeInventoryItems(containerScratch.items, prefabLookup) } catch { items = [] }
      containers.push({ prefabName: prefab.prefabName, x, y, height, creator: containerScratch.creator, items })
      if (containerScratch.creator !== '0') {
        playerStructurePoints.push({ x, z: y })
        structureGeometry.push({
          prefabName: prefab.prefabName,
          material: prefab.pieceMaterial,
          bounds: prefab.pieceBounds,
          x,
          z: y,
          yaw,
        })
      }
      continue
    }

    if (prefab?.retainResource) {
      resourceScratch.picked = false
      resourceScratch.pickedTimeTicks = 0
      resourceScratch.damaged = false
      resourceScratch.disabled = false
      scanResourceValueMaps(reader, databaseVersion, flags, resourceScratch)
      resourceNodes.push(
        prefabHash,
        x,
        y,
        resourceScratch.picked,
        resourceScratch.pickedTimeTicks,
        resourceScratch.damaged,
        resourceScratch.disabled,
      )
      continue
    }

    if (prefab?.retainPiece) {
      const creator = scanPieceCreator(reader, databaseVersion, flags)
      if (creator !== '0') {
        playerStructurePoints.push({ x, z: y })
        structureGeometry.push({
          prefabName: prefab.prefabName,
          material: prefab.pieceMaterial,
          bounds: prefab.pieceBounds,
          x,
          z: y,
          yaw,
        })
      }
      continue
    }

    const retain = Boolean(prefab?.retainPosition)
    const properties: Record<string, unknown> = {}
    if ((flags & 2) !== 0) readValueMap(reader, databaseVersion, 'float', retain, properties)
    if ((flags & 4) !== 0) readValueMap(reader, databaseVersion, 'vector', retain, properties)
    if ((flags & 8) !== 0) readValueMap(reader, databaseVersion, 'quaternion', retain, properties)
    if ((flags & 0x10) !== 0) readValueMap(reader, databaseVersion, 'int', retain, properties)
    if ((flags & 0x20) !== 0) readValueMap(reader, databaseVersion, 'long', retain, properties)
    if ((flags & 0x40) !== 0) readValueMap(reader, databaseVersion, 'string', retain, properties)
    if ((flags & 0x80) !== 0) readValueMap(reader, databaseVersion, 'bytes', retain, properties)

    if (prefab?.retainPosition) {
      trackedObjects.push({
        prefabName: prefab.prefabName,
        componentKinds: prefab.componentKinds,
        x,
        y,
        height,
        properties,
      })
    }
  }

  if (chunked) {
    if (reader.remaining !== 0) throw new Error('World chunk object count does not match its data')
    reader = new BinaryReader(new Uint8Array(chunked.zones))
  }
  const generatedZoneCount = reader.int32()
  if (generatedZoneCount < 0 || generatedZoneCount > Math.floor(reader.remaining / (chunked ? 4 : 8))) throw new Error('Invalid generated zone count')
  const generatedZones = new Int32Array(generatedZoneCount * 2)
  for (let index = 0; index < generatedZoneCount; index += 1) {
    generatedZones[index * 2] = chunked ? reader.int16() : reader.int32()
    generatedZones[index * 2 + 1] = chunked ? reader.int16() : reader.int32()
  }
  reader.int32()
  if (!chunked && databaseVersion >= 21) reader.int32()

  const globalKeys: string[] = []
  if (databaseVersion >= 14) {
    const globalKeyCount = reader.int32()
    for (let index = 0; index < globalKeyCount; index += 1) {
      globalKeys.push(reader.string())
    }
  }

  const locationsGenerated = databaseVersion >= 20 ? reader.boolean() : false
  const locations: ValheimWorldDatabase['locations'] = []
  if (databaseVersion >= 18) {
    const locationCount = reader.int32()
    for (let index = 0; index < locationCount; index += 1) {
      locations.push({
        prefabName: chunked ? (chunked.locationNames[reader.int32()] ?? 'UnknownLocation') : reader.string(),
        x: reader.single(),
        height: reader.single(),
        y: reader.single(),
        placed: databaseVersion >= 19 ? reader.boolean() : false,
      })
    }
  }

  const resourceState: SaveResourceState = {
    netTimeSeconds,
    worldTimeTicks: netTimeSeconds * GAME_TICKS_PER_SECOND,
    generatedZones,
    nodes: resourceNodes.build(),
  }

  const builtStructureGeometry = structureGeometry.build()
  return {
    databaseVersion,
    globalKeys,
    generatedZoneCount,
    locationsGenerated,
    locations,
    trackedObjects,
    containers,
    baseOperations,
    structures: clusterPlayerStructures(playerStructurePoints),
    structurePaths: buildStructureMapPaths(builtStructureGeometry),
    prefabCounts,
    resourceState,
  }
}
