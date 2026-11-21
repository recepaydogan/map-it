import { committedWorldFiles, hasValidWorldChunkHeader, parseChunkMapping } from './chunked-world-save.ts'
import { saveDiagnostic } from './save-diagnostics.ts'
import { discoverSteamRoots } from './steam-save-paths.ts'
import { loadCharacterSave, type CharacterSave } from './character-save-format.ts'
import type { CharacterCompatibility } from './character-compatibility.ts'
import { parseSteamCharacterSaveTimes } from './character-save-recency.ts'
import { parseWorldMetadata, parseWorldTimeSeconds } from './world-save-format.ts'
import type {
  SavePrefabType,
  ValheimWorldDatabase,
  ValheimWorldSave,
} from '../../types/world-save.ts'

const DATABASE_READ_CHUNK_SIZE = 16 * 1024 * 1024
const DATABASE_HEADER_SIZE = 12

function hasOverwolfFileSystem(): boolean {
  return typeof overwolf !== 'undefined' && Boolean(overwolf.io?.readBinaryFile)
}

function directory(path: string): Promise<overwolf.io.FileInDir[]> {
  return new Promise((resolve, reject) => {
    overwolf.io.dir(path, (result) => {
      if (!result.success) {
        saveDiagnostic('directory.failed', { path }, result.error ?? 'directory read failed')
        reject(new Error(result.error ?? `Could not read directory ${path}`))
        return
      }
      saveDiagnostic('directory.read', { path, entries: result.data?.length ?? 0 })
      resolve(result.data ?? [])
    })
  })
}

function fileExists(path: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    overwolf.io.fileExists(path, (result) => {
      if (!result.success) {
        reject(new Error(result.error ?? `Could not inspect ${path}`))
        return
      }
      resolve(Boolean(result.found))
    })
  })
}

function readBinaryChunk(path: string, offset: number, maxBytesToRead: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    overwolf.io.readBinaryFile(
      path,
      {
        encoding: 'UTF8' as overwolf.io.enums.eEncoding,
        maxBytesToRead,
        offset,
      },
      (result) => {
        if (!result.success || !result.content) {
          saveDiagnostic('binary.failed', { path, offset, maxBytesToRead }, result.error ?? 'empty binary response')
          reject(new Error(result.error ?? `Could not read ${path}`))
          return
        }
        resolve(new Uint8Array(result.content, 0, result.length))
      },
    )
  })
}

async function readBinaryFile(path: string, chunkSize = DATABASE_READ_CHUNK_SIZE): Promise<ArrayBuffer> {
  const chunks: Uint8Array[] = []
  let totalLength = 0

  while (true) {
    const chunk = await readBinaryChunk(path, totalLength, chunkSize)
    if (chunk.byteLength === 0) break
    chunks.push(chunk)
    totalLength += chunk.byteLength
    if (chunk.byteLength < chunkSize) break
  }

  const bytes = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes.buffer
}

async function readWorldTimeSeconds(path: string): Promise<number | null> {
  try {
    const header = await readBinaryChunk(path, 0, DATABASE_HEADER_SIZE)
    if (header.byteLength < DATABASE_HEADER_SIZE) return null
    return parseWorldTimeSeconds(
      header.buffer.slice(header.byteOffset, header.byteOffset + header.byteLength),
    )
  } catch {
    return null
  }
}

const joinPath = (...parts: string[]) => parts
  .filter(Boolean)
  .map((part, index) => index === 0 ? part.replace(/[\\/]+$/, '') : part.replace(/^[\\/]+|[\\/]+$/g, ''))
  .join('\\')

async function discoverDirectoryWorlds(
  path: string,
  source: ValheimWorldSave['source'],
): Promise<ValheimWorldSave[]> {
  let entries: overwolf.io.FileInDir[]
  try {
    entries = await directory(path)
  } catch {
    return []
  }

  const metadataFiles = entries.filter((entry) =>
    entry.type === 'file' &&
    entry.name.toLowerCase().endsWith('.fwl') &&
    !entry.name.toLowerCase().includes('_backup') &&
    !entry.name.toLowerCase().endsWith('.old'),
  )

  const chunkedWorlds = await Promise.all(entries.filter((entry) =>
    entry.type === 'dir' && !entry.name.includes('_backup') && !entry.name.endsWith('.old'),
  ).map(async (entry): Promise<ValheimWorldSave | null> => {
    try {
      const worldDirectory = joinPath(path, entry.name)
      const files = committedWorldFiles((await directory(worldDirectory)).filter((file) => file.type === 'file').map((file) => file.name))
      if (!files) {
        saveDiagnostic('world.no-committed-generation', { path: worldDirectory })
        return null
      }
      const fwlPath = joinPath(worldDirectory, files.metadata)
      const databasePath = joinPath(worldDirectory, files.database)
      const metadata = parseWorldMetadata(await readBinaryFile(fwlPath, 64 * 1024), fwlPath, databasePath, source)
      return { ...metadata, id: worldDirectory.toLowerCase(), fileName: entry.name,
        chunksPath: joinPath(worldDirectory, files.chunks), worldTimeSeconds: await readWorldTimeSeconds(databasePath) }
    } catch (error) {
      saveDiagnostic('world.chunked-metadata-failed', { path: joinPath(path, entry.name) }, error)
      return null
    }
  }))
  const legacyResults = await Promise.allSettled(metadataFiles.map(async (entry) => {
    const fwlPath = joinPath(path, entry.name)
    const databasePath = fwlPath.replace(/\.fwl$/i, '.db')
    const hasDatabase = await fileExists(databasePath)
    const [buffer, worldTimeSeconds] = await Promise.all([
      readBinaryFile(fwlPath, 64 * 1024),
      hasDatabase ? readWorldTimeSeconds(databasePath) : Promise.resolve(null),
    ])
    return {
      ...parseWorldMetadata(
        buffer,
        fwlPath,
        hasDatabase ? databasePath : null,
        source,
      ),
      worldTimeSeconds,
    }
  }))
  legacyResults.forEach((result, index) => {
    if (result.status === 'rejected') saveDiagnostic('world.legacy-metadata-failed', { path: joinPath(path, metadataFiles[index].name) }, result.reason)
  })
  const legacyWorlds = legacyResults.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
  const migrated = new Set(chunkedWorlds.filter((world) => world !== null).map((world) => world.uid))
  return [...chunkedWorlds.filter((world) => world !== null), ...legacyWorlds.filter((world) => !migrated.has(world.uid))]
}

async function discoverSteamWorldDirectories(): Promise<string[]> {
  const roots = await discoverSteamRoots()
  saveDiagnostic('steam.roots', { roots })
  const groups = await Promise.all(roots.map(async (root) => {
    const userdata = joinPath(root, 'userdata')
    try {
      const users = await directory(userdata)
      return users
        .filter((entry) => entry.type === 'dir' && /^\d+$/.test(entry.name))
        .map((entry) => joinPath(userdata, entry.name, '892970', 'remote', 'worlds'))
    } catch {
      return []
    }
  }))
  return groups.flat()
}

export async function discoverValheimWorlds(): Promise<ValheimWorldSave[]> {
  if (!hasOverwolfFileSystem()) {
    saveDiagnostic('world.scan-skipped', { reason: 'overwolf-filesystem-unavailable' })
    return []
  }

  const localLow = overwolf.io.paths.localAppData.replace(/[\\/]Local$/i, '\\LocalLow')
  const localDirectories = [
    joinPath(localLow, 'IronGate', 'Valheim', 'worlds_local'),
    joinPath(localLow, 'IronGate', 'Valheim', 'worlds'),
  ]
  const steamDirectories = await discoverSteamWorldDirectories()
  const groups = await Promise.all([
    ...localDirectories.map((path) => discoverDirectoryWorlds(path, 'local')),
    ...steamDirectories.map((path) => discoverDirectoryWorlds(path, 'steam-cloud')),
  ])
  const worlds = groups.flat()
  saveDiagnostic('world.scan-complete', { worlds: worlds.map(world => ({ path: world.fwlPath, uid: world.uid, source: world.source, databasePath: world.databasePath, chunksPath: world.chunksPath })) })
  const unique = new Map(worlds.map((world) => [world.id, world]))
  return [...unique.values()].sort((first, second) =>
    first.name.localeCompare(second.name) || first.seedName.localeCompare(second.seedName),
  )
}

export async function loadValheimWorldDatabase(
  world: Pick<ValheimWorldSave, 'databasePath' | 'chunksPath'>,
  prefabs: SavePrefabType[],
): Promise<ValheimWorldDatabase | null> {
  if (!world.databasePath || !hasOverwolfFileSystem()) return null
  const buffer = await readBinaryFile(world.databasePath)
  const chunks: ArrayBuffer[] = []
  let locationPrefabs: string[] = []
  if (world.chunksPath) {
    const references = parseChunkMapping(await readBinaryFile(world.chunksPath))
    const parent = world.chunksPath.replace(/[\\/][^\\/]+$/, '')
    // Bound IO concurrency and validate every referenced chunk before publishing a snapshot.
    for (const ref of references) {
      const chunk = await readBinaryFile(joinPath(parent, ref.fileName))
      if (!hasValidWorldChunkHeader(chunk)) {
        throw new Error(`Invalid world chunk header: ${ref.fileName}`)
      }
      // ZDOMan.LoadChunks reads the count from the chunk itself. The mapping's
      // m_numZDOs can differ (including in committed saves), so it cannot be
      // used as an integrity check. The parser still reads every declared ZDO
      // with bounds checks and rejects truncated or malformed payloads.
      chunks.push(chunk)
    }
    const response = await fetch('/game-data/locations.json')
    if (!response.ok) throw new Error('Could not load location names for world save')
    const index = await response.json() as { locations: Array<{ prefabName: string }> }
    locationPrefabs = index.locations.map((location) => location.prefabName)
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../../workers/world-save.worker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.onmessage = (event) => {
      if (event.data.type === 'complete') {
        resolve(event.data.database as ValheimWorldDatabase)
      } else {
        reject(new Error(event.data.message))
      }
      worker.terminate()
    }
    worker.onerror = (event) => {
      reject(new Error(event.message))
      worker.terminate()
    }
    worker.postMessage({ buffer, prefabs, chunks: world.chunksPath ? chunks : undefined, locationPrefabs }, [buffer, ...chunks])
  })
}

export interface ValheimCharacterFile {
  id: string
  fileName: string
  path: string
  source: ValheimWorldSave['source']
  lastPlayedAt?: number
}

async function discoverDirectoryCharacters(
  path: string,
  source: ValheimWorldSave['source'],
): Promise<ValheimCharacterFile[]> {
  let entries: overwolf.io.FileInDir[]
  try {
    entries = await directory(path)
  } catch {
    return []
  }
  const saveTimes = source === 'steam-cloud'
    ? await new Promise<Map<string, number>>(resolve => {
      const cachePath = path.replace(/[\\/]remote[\\/]characters$/i, '\\remotecache.vdf')
      try {
        overwolf.io.readFileContents(cachePath, 'UTF8' as overwolf.io.enums.eEncoding, result =>
          resolve(result.success && result.content ? parseSteamCharacterSaveTimes(result.content) : new Map()))
      } catch { resolve(new Map()) }
    }) : new Map<string, number>()
  return entries
    .filter((entry) =>
      entry.type === 'file' &&
      entry.name.toLowerCase().endsWith('.fch') &&
      !entry.name.toLowerCase().includes('_backup') &&
      !entry.name.toLowerCase().endsWith('.old'))
    .map((entry) => ({
      id: joinPath(path, entry.name).toLowerCase(),
      fileName: entry.name.replace(/\.fch$/i, ''),
      path: joinPath(path, entry.name),
      source,
      lastPlayedAt: saveTimes.get(entry.name.toLowerCase()),
    }))
}

/** Character files (.fch) hold the player's map pins per world. */
export async function discoverValheimCharacters(): Promise<ValheimCharacterFile[]> {
  if (!hasOverwolfFileSystem()) {
    saveDiagnostic('character.scan-skipped', { reason: 'overwolf-filesystem-unavailable' })
    return []
  }
  const localLow = overwolf.io.paths.localAppData.replace(/[\\/]Local$/i, '\\LocalLow')
  const localDirectories = [
    joinPath(localLow, 'IronGate', 'Valheim', 'characters_local'),
    joinPath(localLow, 'IronGate', 'Valheim', 'characters'),
  ]
  const steamDirectories = (await discoverSteamWorldDirectories())
    .map((worldsPath) => worldsPath.replace(/[\\/]worlds$/i, '\\characters'))
  const groups = await Promise.all([
    ...localDirectories.map((path) => discoverDirectoryCharacters(path, 'local')),
    ...steamDirectories.map((path) => discoverDirectoryCharacters(path, 'steam-cloud')),
  ])
  const unique = new Map(groups.flat().map((file) => [file.id, file]))
  saveDiagnostic('character.scan-complete', { files: [...unique.values()].map(file => ({ path: file.path, source: file.source })) })
  return [...unique.values()]
}

export async function loadValheimCharacter(file: ValheimCharacterFile, compatibility: CharacterCompatibility | null = null): Promise<CharacterSave | null> {
  if (!hasOverwolfFileSystem()) return null
  const buffer = await readBinaryFile(file.path, 4 * 1024 * 1024)
  return loadCharacterSave(buffer, compatibility)
}
