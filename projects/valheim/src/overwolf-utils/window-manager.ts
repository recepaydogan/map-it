import { isOverwolf } from '../utils/overwolf'

export type AppWindowName = 'main' | 'in_game' | 'overlay' | 'craft_overlay' | 'craft_hint' | 'companion'

export const MAIN_WINDOW_MIN_WIDTH = 1300
export const MAIN_WINDOW_MIN_HEIGHT = 840

export const obtainDeclaredWindow = (
  windowName: AppWindowName,
): Promise<overwolf.windows.WindowResult> =>
  new Promise((resolve, reject) => {
    overwolf.windows.obtainDeclaredWindow(windowName, (result) => {
      if (result.success) resolve(result)
      else reject(new Error(result.error ?? `Unable to obtain ${windowName}`))
    })
  })

export const getOpenWindow = (
  windowName: AppWindowName,
): Promise<overwolf.windows.WindowResult['window'] | null> =>
  new Promise((resolve) => {
    overwolf.windows.getWindow(windowName, (result) => {
      resolve(result.success ? result.window : null)
    })
  })

export const restoreWindow = async (windowName: AppWindowName): Promise<void> => {
  if (!isOverwolf()) return
  const result = await obtainDeclaredWindow(windowName)
  await new Promise<void>((resolve, reject) => {
    overwolf.windows.restore(result.window.id, (restoreResult) => {
      if (restoreResult.success) resolve()
      else reject(new Error(restoreResult.error ?? `Unable to restore ${windowName}`))
    })
  })
}

export const revealWindow = async (windowName: AppWindowName): Promise<void> => {
  await restoreWindow(windowName)
  const result = await obtainDeclaredWindow(windowName)
  await new Promise<void>((resolve, reject) => {
    overwolf.windows.bringToFront(result.window.id, true, (frontResult) => {
      if (frontResult.success) resolve()
      else reject(new Error(frontResult.error ?? `Unable to focus ${windowName}`))
    })
  })
}

export const hideWindow = async (windowName: AppWindowName): Promise<void> => {
  if (!isOverwolf()) return
  const result = await obtainDeclaredWindow(windowName)
  await new Promise<void>((resolve, reject) => {
    overwolf.windows.hide(result.window.id, (hideResult) => {
      if (hideResult.success) resolve()
      else reject(new Error(hideResult.error ?? `Unable to hide ${windowName}`))
    })
  })
}

export const minimizeWindow = async (windowName: AppWindowName): Promise<void> => {
  if (!isOverwolf()) return
  const result = await obtainDeclaredWindow(windowName)
  await new Promise<void>((resolve, reject) => {
    overwolf.windows.minimize(result.window.id, (minimizeResult) => {
      if (minimizeResult.success) resolve()
      else reject(new Error(minimizeResult.error ?? `Unable to minimize ${windowName}`))
    })
  })
}

export const closeWindow = async (windowName: AppWindowName): Promise<void> => {
  if (!isOverwolf()) return
  const result = await obtainDeclaredWindow(windowName)
  await new Promise<void>((resolve, reject) => {
    overwolf.windows.close(result.window.id, (closeResult) => {
      if (closeResult.success) resolve()
      else reject(new Error(closeResult.error ?? `Unable to close ${windowName}`))
    })
  })
}

export const toggleWindow = async (
  windowName: AppWindowName,
  hideWhenVisible = false,
): Promise<void> => {
  if (!isOverwolf()) return
  const current = await getOpenWindow(windowName)
  const state = current?.stateEx ?? current?.state

  if (!current || state === 'hidden' || state === 'minimized' || state === 'closed') {
    await restoreWindow(windowName)
    return
  }

  if (hideWhenVisible) await hideWindow(windowName)
  else await minimizeWindow(windowName)
}

export const dragCurrentWindow = (): void => {
  if (!isOverwolf()) return
  overwolf.windows.getCurrentWindow((result) => {
    if (result.success) overwolf.windows.dragMove(result.window.id)
  })
}

export const toggleMaximizeWindow = async (windowName: AppWindowName): Promise<void> => {
  if (!isOverwolf()) return
  const result = await obtainDeclaredWindow(windowName)
  const isMaximized = result.window.stateEx === 'maximized' || result.window.state === 'maximized'
  await new Promise<void>((resolve, reject) => {
    const callback = (windowResult: { success: boolean; error?: string }) => {
      if (windowResult.success) resolve()
      else reject(new Error(windowResult.error ?? `Unable to resize ${windowName}`))
    }
    if (isMaximized) overwolf.windows.restore(result.window.id, callback)
    else overwolf.windows.maximize(result.window.id, callback)
  })
}

/**
 * Restore only when the window is actually hidden. `restore` on a maximized
 * window un-maximizes it, so an unconditional restore would strip the user's
 * fullscreen state on every game launch.
 */
export const restoreWindowPreservingPlacement = async (windowName: AppWindowName): Promise<void> => {
  if (!isOverwolf()) return
  const result = await obtainDeclaredWindow(windowName)
  const state = String(result.window.stateEx ?? result.window.state ?? '').toLowerCase()
  if (state === 'minimized' || state === 'hidden' || state === 'closed' || state === '') {
    await restoreWindow(windowName)
  }
}

type BringToFrontFn = (windowId: string, grabFocus: boolean, callback: (result: { success: boolean }) => void) => void
type SetTopmostFn = (windowId: string, topmost: boolean, callback: (result: { success: boolean }) => void) => void

export const bringWindowToFront = async (windowName: AppWindowName, grabFocus = true): Promise<void> => {
  if (!isOverwolf()) return
  const result = await obtainDeclaredWindow(windowName)
  const bringToFront = (overwolf.windows as unknown as { bringToFront?: BringToFrontFn }).bringToFront
  if (!bringToFront) return
  await new Promise<void>((resolve) => bringToFront(result.window.id, grabFocus, () => resolve()))
}

/** Keep a restored desktop window alive behind the game on one monitor. */
export const sendWindowToBack = async (windowName: AppWindowName): Promise<void> => {
  if (!isOverwolf()) return
  const result = await obtainDeclaredWindow(windowName)
  const windowsApi = overwolf.windows as unknown as {
    sendToBack?: (windowId: string, callback: (result: { success: boolean; error?: string }) => void) => void
  }
  if (!windowsApi.sendToBack) return
  await new Promise<void>((resolve, reject) => windowsApi.sendToBack!(result.window.id, (backResult) => {
    if (backResult.success) resolve()
    else reject(new Error(backResult.error ?? `Unable to send ${windowName} to back`))
  }))
}

/**
 * Raise a window above an external foreground application (the game that just
 * launched). Windows' foreground lock stops a background process from stealing
 * focus, so plain bringToFront loses the z-order fight. setTopmost is a pure
 * z-order change not subject to that lock: pulse it on, then release it so the
 * window never stays pinned always-on-top.
 */
export const surfaceWindowOverExternalApp = async (windowName: AppWindowName, pinMs = 1200): Promise<void> => {
  if (!isOverwolf()) return
  const result = await obtainDeclaredWindow(windowName).catch(() => null)
  if (!result) return
  const id = result.window.id
  const api = overwolf.windows as unknown as { bringToFront?: BringToFrontFn; setTopmost?: SetTopmostFn }
  api.bringToFront?.(id, true, () => {})
  const setTopmost = api.setTopmost
  if (!setTopmost) return
  setTopmost(id, true, () => {})
  window.setTimeout(() => setTopmost(id, false, () => {}), pinMs)
}

export interface MonitorInfo {
  id?: string
  handle?: { value?: number }
  x?: number
  y?: number
  width?: number
  height?: number
  logicalX?: number
  logicalY?: number
  logicalWidth?: number
  logicalHeight?: number
  dpiX?: number
  is_primary?: boolean
  workingArea?: WorkingAreaLike
}

export interface WorkingAreaLike {
  x?: number
  y?: number
  left?: number
  top?: number
  width?: number
  height?: number
}

export interface DisplayRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

const toNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const getDisplayBounds = (display: MonitorInfo): DisplayRect => {
  const scale = Math.max(0.5, toNumber(display.dpiX, 96) / 96)
  const left = toNumber(display.logicalX, toNumber(display.x, 0))
  const top = toNumber(display.logicalY, toNumber(display.y, 0))
  const width = Math.floor(toNumber(display.logicalWidth, toNumber(display.width, MAIN_WINDOW_MIN_WIDTH) / scale))
  const height = Math.floor(toNumber(display.logicalHeight, toNumber(display.height, MAIN_WINDOW_MIN_HEIGHT) / scale))
  return { left, top, width, height, right: left + width, bottom: top + height }
}

export const usableBounds = (display: MonitorInfo, workingArea?: WorkingAreaLike): DisplayRect => {
  const bounds = getDisplayBounds(display)
  const area = display.workingArea ?? workingArea
  if (!area) return bounds
  const width = toNumber(area.width, bounds.width)
  const height = toNumber(area.height, bounds.height)
  // Working area is only usable when it actually lies on this display.
  const left = toNumber(area.left, toNumber(area.x, bounds.left))
  const top = toNumber(area.top, toNumber(area.y, bounds.top))
  if (left < bounds.left - 1 || left > bounds.right || top < bounds.top - 1 || top > bounds.bottom) return bounds
  return { left, top, width, height, right: left + width, bottom: top + height }
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max < min ? min : max)

/**
 * Centres a window on a monitor, un-maximizing first when needed and waiting
 * for that to land, then re-maximizing on the target if it was maximized. All
 * geometry calls are best-effort: Overwolf drops them often enough that
 * callers verify and retry.
 */
export const centerWindowOnMonitor = async (
  windowName: AppWindowName,
  monitor: MonitorInfo,
  workingArea?: WorkingAreaLike,
): Promise<void> => {
  if (!isOverwolf()) return
  let win = await getOpenWindow(windowName)
  if (!win) return
  const state = String(win.stateEx ?? win.state ?? '').toLowerCase()
  if (state === 'minimized' || state === 'closed') return
  const wasMaximized = state === 'maximized'
  if (wasMaximized) {
    await new Promise<void>((resolve) => overwolf.windows.restore(win!.id, () => resolve()))
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 60))
      win = await getOpenWindow(windowName)
      if (!win) return
      if (String(win.stateEx ?? win.state ?? '').toLowerCase() !== 'maximized') break
    }
  }
  const bounds = usableBounds(monitor, workingArea)
  const width = Math.floor(Math.min(toNumber(win.width, MAIN_WINDOW_MIN_WIDTH), Math.max(MAIN_WINDOW_MIN_WIDTH, bounds.width)))
  const height = Math.floor(Math.min(toNumber(win.height, MAIN_WINDOW_MIN_HEIGHT), Math.max(MAIN_WINDOW_MIN_HEIGHT, bounds.height)))
  const left = Math.floor(clamp(bounds.left + bounds.width / 2 - width / 2, bounds.left, bounds.right - width))
  const top = Math.floor(clamp(bounds.top + bounds.height / 2 - height / 2, bounds.top, bounds.bottom - height))
  const id = win.id
  if (!wasMaximized && (width !== Math.floor(toNumber(win.width, 0)) || height !== Math.floor(toNumber(win.height, 0)))) {
    await new Promise<void>((resolve) => overwolf.windows.changeSize({ window_id: id, width, height, auto_dpi_resize: true }, () => resolve()))
  }
  await new Promise<void>((resolve) => overwolf.windows.changePosition(id, left, top, () => resolve()))
  if (wasMaximized) {
    // Maximizing right after the move fills the monitor the window was on
    // BEFORE changePosition, dragging it back; give the move time to land.
    await new Promise((resolve) => window.setTimeout(resolve, 350))
    await new Promise<void>((resolve) => overwolf.windows.maximize(id, () => resolve()))
  }
}
