import { renderValheimMinimap } from '../lib/valheim/minimap-renderer.ts'

interface TileRequest {
  id: number
  seedName: string
  resolution: number
  bounds: { left: number; top: number; right: number; bottom: number }
}

self.onmessage = async (event: MessageEvent<TileRequest>) => {
  const { id, seedName, resolution, bounds } = event.data
  try {
    const canvas = new OffscreenCanvas(resolution, resolution)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not create the minimap tile canvas.')
    await renderValheimMinimap({
      context,
      resolution,
      seedName,
      bounds,
      isCancelled: () => false,
    })
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.94 })
    self.postMessage({ id, blob })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
}
