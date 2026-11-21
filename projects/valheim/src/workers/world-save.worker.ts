import { parseChunkedWorldDatabase } from '../lib/valheim/chunked-world-save.ts'
import { parseWorldDatabase } from '../lib/valheim/world-save-format.ts'
import type { SavePrefabType } from '../types/world-save.ts'

interface WorldSaveWorkerRequest {
  buffer: ArrayBuffer
  prefabs: SavePrefabType[]
  chunks?: ArrayBuffer[]
  locationPrefabs?: string[]
}

self.onmessage = async (event: MessageEvent<WorldSaveWorkerRequest>) => {
  try {
    const database = event.data.chunks
      ? await parseChunkedWorldDatabase(event.data.buffer, event.data.prefabs, event.data.chunks, event.data.locationPrefabs ?? [])
      : parseWorldDatabase(event.data.buffer, event.data.prefabs)
    const { generatedZones, nodes } = database.resourceState
    // The resource snapshot can hold hundreds of thousands of nodes; transfer
    // the typed-array buffers instead of structured-cloning them.
    const transfers = [
      generatedZones.buffer,
      nodes.prefabHashes.buffer,
      nodes.x.buffer,
      nodes.z.buffer,
      nodes.picked.buffer,
      nodes.pickedTimeTicks.buffer,
      nodes.damaged.buffer,
      nodes.disabled.buffer,
    ].filter((buffer, index, all) => all.indexOf(buffer) === index)
    self.postMessage({ type: 'complete', database }, { transfer: transfers })
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
