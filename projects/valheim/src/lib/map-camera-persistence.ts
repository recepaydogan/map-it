export interface MapCameraView { zoom: number; panX: number; panY: number }

const STORAGE_PREFIX = 'valheim-companion:map-camera:v1:'
const storageKey = (cameraKey: string) => `${STORAGE_PREFIX}${encodeURIComponent(cameraKey)}`

export function readMapCamera(cameraKey: string): MapCameraView | null {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey(cameraKey)) ?? 'null')
    if (!value || typeof value !== 'object') return null
    const { zoom, panX, panY } = value as Record<string, unknown>
    if (typeof zoom !== 'number' || !Number.isFinite(zoom) || zoom <= 0 || zoom > 48 ||
      typeof panX !== 'number' || !Number.isFinite(panX) || Math.abs(panX) > 1_000_000 ||
      typeof panY !== 'number' || !Number.isFinite(panY) || Math.abs(panY) > 1_000_000) return null
    return { zoom, panX, panY }
  } catch { return null }
}

export function writeMapCamera(cameraKey: string, view: MapCameraView): void {
  if (!Number.isFinite(view.zoom) || !Number.isFinite(view.panX) || !Number.isFinite(view.panY)) return
  try { window.localStorage.setItem(storageKey(cameraKey), JSON.stringify(view)) } catch { /* Camera remains available in memory. */ }
}
