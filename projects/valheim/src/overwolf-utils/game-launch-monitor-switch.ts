/**
 * Game-launch monitor switch — ported from Elden Ring Atlas (itself from BF6 /
 * wedraft). Runs in the MAIN window only: the dashboard listens for Valheim
 * launches and moves ITSELF off the game's monitor, then surfaces.
 *
 * Why the main window and not the background: the game's `monitorHandle` can
 * arrive several seconds after the launch event (the game window does not
 * exist yet). This engine PROBES `getRunningGameInfo` every 500 ms (max 16)
 * until the handle is known, and also probes at startup so it works when the
 * game is already running when the app opens.
 *
 * Contract:
 *  - move only when >=2 monitors and the window is on (or overlaps) the game's
 *    monitor; the auto-move runs ONCE per game process (sourceKey dedup).
 *  - after moving, verify 900 ms later and retry up to 2 times.
 *  - restore and surface only on multi-monitor setups. On one monitor the
 *    background opens the desktop window behind the game until it exits.
 *  - never react to any other game (Valheim class id 21668).
 */
import {
  bringWindowToFront,
  centerWindowOnMonitor,
  getDisplayBounds,
  getOpenWindow,
  restoreWindowPreservingPlacement,
  surfaceWindowOverExternalApp,
  type MonitorInfo,
  type WorkingAreaLike,
} from './window-manager'
import { isOverwolf } from '../utils/overwolf'

const MAIN = 'main' as const
const VALHEIM_CLASS_ID = 21668
const PROBE_INTERVAL_MS = 500
const PROBE_ATTEMPTS = 16
const SETUP_RETRY_MS = 250
const SETUP_ATTEMPTS = 20
const VERIFY_DELAY_MS = 900
const VERIFY_ATTEMPTS = 2

interface GameInfoLike {
  isRunning?: boolean
  classId?: number
  id?: number
  title?: string
  processId?: number
  gameProcessId?: number
  monitorHandle?: { value?: number } | null
}

interface WindowLike {
  id: string
  monitorId?: string
  left?: number
  top?: number
  width?: number
  height?: number
  state?: string
  stateEx?: string
}

const isValheim = (info: GameInfoLike | null | undefined): boolean => {
  if (!info) return false
  if (Number(info.classId) === VALHEIM_CLASS_ID) return true
  if (typeof info.id === 'number' && Math.floor(info.id / 10) === VALHEIM_CLASS_ID) return true
  return /valheim/i.test(String(info.title ?? ''))
}

let setupAttempts = 0
let listenersRegistered = false
let probeTimer: number | null = null
let lastSourceKey: string | null = null

const debug = (message: string, detail?: unknown) => {
  console.debug(`[monitor-switch] ${message}`, detail ?? '')
}

const rectOf = (win: WindowLike) => ({
  left: Number(win.left ?? 0),
  top: Number(win.top ?? 0),
  width: Number(win.width ?? 0),
  height: Number(win.height ?? 0),
})

const overlaps = (win: WindowLike, monitor: MonitorInfo): boolean => {
  const rect = rectOf(win)
  const bounds = getDisplayBounds(monitor)
  const width = Math.max(0, Math.min(rect.left + rect.width, bounds.right) - Math.max(rect.left, bounds.left))
  const height = Math.max(0, Math.min(rect.top + rect.height, bounds.bottom) - Math.max(rect.top, bounds.top))
  return width * height > 0
}

const monitorOfWindow = (win: WindowLike, displays: MonitorInfo[]): MonitorInfo | null => {
  if (win.monitorId) {
    const byId = displays.find((display) => display.id === win.monitorId)
    if (byId) return byId
  }
  const rect = rectOf(win)
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  return displays.find((display) => {
    const bounds = getDisplayBounds(display)
    return centerX >= bounds.left && centerX <= bounds.right && centerY >= bounds.top && centerY <= bounds.bottom
  }) ?? displays.find((display) => display.is_primary) ?? displays[0] ?? null
}

const sameMonitor = (a: MonitorInfo | null, b: MonitorInfo | null): boolean => {
  if (!a || !b) return false
  if (a.id && b.id) return a.id === b.id
  return a === b || a.handle?.value === b.handle?.value
}

const getMonitors = () => new Promise<{ displays: MonitorInfo[]; workingArea?: WorkingAreaLike }>((resolve) => {
  const utils = overwolf.utils as unknown as {
    getMonitorsList?: (callback: (result: { displays?: MonitorInfo[]; workingArea?: WorkingAreaLike }) => void) => void
  }
  if (!utils.getMonitorsList) {
    resolve({ displays: [] })
    return
  }
  utils.getMonitorsList((result) => resolve({ displays: result?.displays ?? [], workingArea: result?.workingArea }))
})

const surfaceMain = () => {
  void surfaceWindowOverExternalApp(MAIN).catch(() => bringWindowToFront(MAIN).catch(() => {}))
}

const verifyLanded = async (
  source: MonitorInfo,
  target: MonitorInfo,
  displays: MonitorInfo[],
  workingArea: WorkingAreaLike | undefined,
  attemptsLeft: number,
): Promise<boolean> => {
  await new Promise((resolve) => window.setTimeout(resolve, VERIFY_DELAY_MS))
  const win = await getOpenWindow(MAIN)
  if (!win) return false
  const current = monitorOfWindow(win, displays)
  const stillOnSource = sameMonitor(current, source) || overlaps(win, source)
  if (!stillOnSource) {
    debug('auto move landed', { target: target.id })
    return true
  }
  if (attemptsLeft <= 0) {
    debug('auto move gave up: still on the game monitor')
    return false
  }
  debug('auto move retry', { attemptsLeft })
  await centerWindowOnMonitor(MAIN, target, workingArea)
  return verifyLanded(source, target, displays, workingArea, attemptsLeft - 1)
}

const runGameLaunchResponse = async (
  gameMonitorHandle: { value?: number } | null | undefined,
  sourceKey: string,
): Promise<void> => {
  const { displays, workingArea } = await getMonitors()
  if (displays.length < 2) return
  await restoreWindowPreservingPlacement(MAIN).catch(() => {})
  const source = displays.find((display) => display.handle?.value === gameMonitorHandle?.value) ?? displays[0]
  const target = displays.find((display) => display !== source)
  const win = await getOpenWindow(MAIN)
  if (!target || !win || lastSourceKey !== sourceKey) return
  const current = monitorOfWindow(win, displays)
  const onSource = sameMonitor(current, source) || overlaps(win, source)
  if (onSource) {
    debug('moving main away from the game monitor', { source: source.id, target: target.id })
    await centerWindowOnMonitor(MAIN, target, workingArea)
    if (await verifyLanded(source, target, displays, workingArea, VERIFY_ATTEMPTS) &&
        lastSourceKey === sourceKey) surfaceMain()
  } else {
    debug('main already off the game monitor')
    if (lastSourceKey === sourceKey) surfaceMain()
  }
}

const moveByGameInfo = (info: GameInfoLike | null | undefined, reason: string): boolean => {
  if (!info?.monitorHandle) return false
  if (!isValheim(info)) return false
  const sourceKey = `game:${info.processId ?? info.gameProcessId ?? info.id ?? info.classId ?? info.monitorHandle.value}`
  if (lastSourceKey === sourceKey) return true
  // Claim synchronously: onGameInfoUpdated fires repeatedly while the game
  // boots and the response is a long async chain.
  lastSourceKey = sourceKey
  debug('auto move by game', { reason, sourceKey })
  void runGameLaunchResponse(info.monitorHandle, sourceKey)
  return true
}

const readRunningGame = () => new Promise<GameInfoLike | null>((resolve) => {
  overwolf.games.getRunningGameInfo((result) => resolve(result?.isRunning ? (result as GameInfoLike) : null))
})

const startProbe = (reason: string): void => {
  if (probeTimer !== null) window.clearTimeout(probeTimer)
  probeTimer = null
  let attempts = 0
  const run = async () => {
    attempts += 1
    const info = await readRunningGame()
    const moved = moveByGameInfo(info, reason)
    if (moved || attempts >= PROBE_ATTEMPTS || !info) {
      probeTimer = null
      return
    }
    probeTimer = window.setTimeout(() => void run(), PROBE_INTERVAL_MS)
  }
  void run()
}

/**
 * Registers the game-launch listeners and runs the startup probe. Only ever
 * arms itself in the main window; calling it elsewhere is a no-op.
 */
export function setupGameLaunchMonitorSwitch(): void {
  if (!isOverwolf()) return
  const utils = overwolf.utils as unknown as { getMonitorsList?: unknown }
  if (!utils.getMonitorsList || !overwolf.windows) {
    if (setupAttempts >= SETUP_ATTEMPTS) return
    setupAttempts += 1
    window.setTimeout(setupGameLaunchMonitorSwitch, SETUP_RETRY_MS)
    return
  }
  if (listenersRegistered) {
    startProbe('setup-refresh')
    return
  }
  overwolf.windows.getCurrentWindow((result) => {
    const name = String(result?.window?.name ?? '')
    if (name && name !== MAIN) return
    if (listenersRegistered) return
    listenersRegistered = true
    startProbe('startup')
    overwolf.games.onGameLaunched.addListener((info) => {
      if (!moveByGameInfo(info as GameInfoLike, 'onGameLaunched')) startProbe('onGameLaunched')
    })
    overwolf.games.onGameInfoUpdated.addListener((event) => {
      const info = event?.gameInfo as GameInfoLike | undefined
      if (info?.isRunning) moveByGameInfo(info, 'onGameInfoUpdated')
      else if (event?.runningChanged) lastSourceKey = null
    })
    overwolf.extensions.onAppLaunchTriggered.addListener((event) => {
      const origin = String((event as { origin?: string })?.origin ?? '')
      if (!/gamelaunchevent/i.test(origin)) return
      startProbe('appLaunchTriggered')
    })
  })
}
