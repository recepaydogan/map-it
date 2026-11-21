import { BinaryReader, parseWorldDatabase } from './world-save-format.ts'
import { getStableHashCode } from './stable-hash.ts'
import type { SavePrefabType } from '../../types/world-save.ts'

const MIN_CHUNKED_WORLD_VERSION = 40
const MAX_CHUNKED_WORLD_VERSION = 42

/** Check the header before a chunk is handed to the world-save worker. */
export function hasValidWorldChunkHeader(chunk: ArrayBuffer): boolean {
  if (chunk.byteLength < 6) return false
  const header = new DataView(chunk)
  const version = header.getUint16(0, true)
  return version >= MIN_CHUNKED_WORLD_VERSION && version <= MAX_CHUNKED_WORLD_VERSION && header.getInt32(2, true) >= 0
}

/** Only committed generations are eligible. Never mix files from two saves. */
export function committedWorldFiles(names: string[]): { metadata: string; database: string; chunks: string } | null {
  const files = new Map(names.map((name) => [name.toLowerCase(), name]))
  const generations = names.flatMap((name) => {
    const match = /^_main\.(\d+)\.ok$/i.exec(name)
    return match ? [Number(match[1])] : []
  }).sort((a, b) => b - a)
  for (const generation of generations) {
    const prefix = `_main.${generation}`
    const metadata = files.get(`${prefix}.fwl2`)
    const database = files.get(`${prefix}.db2`)
    const chunks = files.get(`${prefix}.chunks`)
    if (metadata && database && chunks) return { metadata, database, chunks }
  }
  return null
}

export interface WorldChunkReference {
  fileName: string
  /** Mapping metadata only; the chunk header is authoritative when loading. */
  objectCount: number
}

export function parseChunkMapping(buffer: ArrayBuffer): WorldChunkReference[] {
  const reader = new BinaryReader(new Uint8Array(buffer))
  const version = reader.uint16()
  if (version < MIN_CHUNKED_WORLD_VERSION || version > MAX_CHUNKED_WORLD_VERSION) throw new Error(`Unsupported chunk mapping version ${version}`)
  reader.int32() // capacity hint; can include superseded chunks after a split
  const count = reader.int32()
  if (count < 0 || count > Math.floor(reader.remaining / 11)) throw new Error('Invalid world chunk count')
  const chunks: WorldChunkReference[] = []
  const names = new Set<string>()
  for (let i = 0; i < count; i++) {
    const chunk = reader.uint16()
    const size = reader.byte()
    const revision = reader.uint32()
    const objectCount = reader.int32()
    if (size > 3 || objectCount < 0) throw new Error('Invalid world chunk record')
    const fileName = `${(chunk >>> 8).toString(16).padStart(2, '0')}_${(chunk & 255).toString(16).padStart(2, '0')}__${size}_${revision}.chunk`
    if (names.has(fileName)) throw new Error('Duplicate world chunk')
    names.add(fileName)
    chunks.push({ fileName, objectCount })
  }
  if (reader.remaining !== 0) throw new Error('Incomplete world chunk mapping')
  return chunks
}

export async function parseChunkedWorldDatabase(
  buffer: ArrayBuffer,
  prefabs: SavePrefabType[],
  chunks: ArrayBuffer[],
  locationPrefabs: string[],
) {
  const header = new BinaryReader(new Uint8Array(buffer))
  const version = header.int32()
  if (version < MIN_CHUNKED_WORLD_VERSION || version > MAX_CHUNKED_WORLD_VERSION) throw new Error(`Unsupported world version ${version}`)
  header.double()
  const compressed = header.bytesOf(header.int32())
  const stream = new Blob([new Uint8Array(compressed)]).stream().pipeThrough(new DecompressionStream('gzip'))
  const zones = await new Response(stream).arrayBuffer()
  let objectCount = 0
  const data = chunks.map((chunk) => {
    const reader = new BinaryReader(new Uint8Array(chunk))
    const chunkVersion = reader.uint16()
    const count = reader.int32()
    if (!hasValidWorldChunkHeader(chunk) || chunkVersion > version || count < 0) throw new Error('Unsupported world chunk')
    objectCount += count
    return reader.bytesOf(reader.remaining)
  })
  const objects = new Uint8Array(data.reduce((total, chunk) => total + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of data) { objects.set(chunk, offset); offset += chunk.byteLength }
  const locationNames = Object.fromEntries(locationPrefabs.map((name) => [getStableHashCode(name), name]))
  return parseWorldDatabase(buffer, prefabs, { objects: objects.buffer, objectCount, zones, locationNames })
}
