import { trackCraftWindow, type CraftOpenSource } from '../lib/analytics/craft-window-analytics'
import { EVENTS } from '../lib/analytics/events'
import { readPreferences } from '../store/preferences'
import { requestCraftWindowClose } from './craft-close-request'
import { canAutoLaunchCraftCompanion } from './craft-auto-launch-session.ts'
import { isOverwolf } from '../utils/overwolf'
import { centerWindowOnMonitor, getDisplayBounds, getOpenWindow, hideWindow, obtainDeclaredWindow, restoreWindow, surfaceWindowOverExternalApp, usableBounds, type MonitorInfo, type WorkingAreaLike } from './window-manager'

export interface CraftGameInfo {
  monitorHandle?: { value?: number } | null
}

const monitors = () => new Promise<{ displays: MonitorInfo[]; workingArea?: WorkingAreaLike }>((resolve) => {
  const utils = overwolf.utils as unknown as { getMonitorsList?: (callback: (result: { displays?: MonitorInfo[]; workingArea?: WorkingAreaLike }) => void) => void }
  if (!utils?.getMonitorsList) { resolve({ displays: [] }); return }
  utils.getMonitorsList((result) => resolve({ displays: result.displays ?? [], workingArea: result.workingArea }))
})

type OpenWindow = NonNullable<Awaited<ReturnType<typeof getOpenWindow>>>
const windowMonitor = (win: OpenWindow, displays: MonitorInfo[]) =>
  displays.find((display) => display.id && display.id === win.monitorId)
  ?? displays.find((display) => {
    const bounds = getDisplayBounds(display)
    const x = win.left + win.width / 2
    const y = win.top + win.height / 2
    return x >= bounds.left && x < bounds.right && y >= bounds.top && y < bounds.bottom
  })
const visible = (win: OpenWindow) => ['normal', 'maximized'].includes(win.stateEx ?? win.state ?? '')
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(value, maximum))
const move = (id: string, left: number, top: number) => new Promise<void>((resolve, reject) =>
  overwolf.windows.changePosition(id, Math.floor(left), Math.floor(top), (result) => {
    if (result.success) resolve()
    else reject(new Error(result.error ?? 'Companion positioning failed'))
  }))

/** Shows the short, click-through hotkey reminder on the game's monitor. */
export async function showCraftHotkeyHint(info: CraftGameInfo, active: () => boolean) {
  const layout = await monitors()
  if (!active()) return
  let current = info
  for (let attempt = 0; layout.displays.length >= 2 && current.monitorHandle?.value == null && attempt < 6 && active(); attempt++) {
    await new Promise((resolve) => window.setTimeout(resolve, 250))
    current = await new Promise<CraftGameInfo>((resolve) => overwolf.games.getRunningGameInfo((result) => resolve(result ?? {})))
  }
  if (!active()) return
  const target = layout.displays.find((display) => current.monitorHandle?.value != null && display.handle?.value === current.monitorHandle.value)
    ?? layout.displays.find((display) => display.is_primary)
    ?? layout.displays[0]
  const hint = await obtainDeclaredWindow('craft_hint')
  if (!active()) return
  if (target) {
    const bounds = getDisplayBounds(target)
    await move(hint.window.id, bounds.left + 20, bounds.top + 20)
  }
  if (!active()) return
  await restoreWindow('craft_hint')
  if (!active()) await hideWindow('craft_hint')
}

/** Same docking order as ER/BF6: right, left, shift the pair, left overlap. */
async function parkCompanionBesideMain(onlyWhenDifferentMonitor = false): Promise<boolean> {
  const [anchor, satellite, layout] = await Promise.all([getOpenWindow('main'), getOpenWindow('companion'), monitors()])
  if (!anchor || !satellite || !visible(anchor) || !visible(satellite)) return false
  const monitor = windowMonitor(anchor, layout.displays)
  if (!monitor) return false
  if (onlyWhenDifferentMonitor && monitor === windowMonitor(satellite, layout.displays)) return true
  const bounds = usableBounds(monitor, layout.workingArea)
  const gap = 8
  const pairWidth = anchor.width + gap + satellite.width
  let anchorLeft = anchor.left
  let left = anchor.left
  if (bounds.right - (anchor.left + anchor.width) >= satellite.width + gap) {
    left = anchor.left + anchor.width + gap
  } else if (anchor.left - bounds.left >= satellite.width + gap) {
    left = anchor.left - satellite.width - gap
  } else if (pairWidth <= bounds.width && (anchor.stateEx ?? anchor.state) !== 'maximized') {
    anchorLeft = clamp(anchor.left, bounds.left, bounds.right - pairWidth)
    left = anchorLeft + anchor.width + gap
  }
  if (anchorLeft !== anchor.left) await move(anchor.id, anchorLeft, anchor.top)
  await move(satellite.id, clamp(left, bounds.left, bounds.right - satellite.width), clamp(anchor.top, bounds.top, bounds.bottom - satellite.height))
  return true
}

let followGeneration = 0
function followMainAfterLaunch(active: () => boolean, initiallyParked: boolean) {
  const generation = ++followGeneration
  const deadline = Date.now() + 12_000
  let parked = initiallyParked
  const tick = async () => {
    if (generation !== followGeneration || !active() || Date.now() >= deadline) return
    const satellite = await getOpenWindow('companion')
    // Closing/minimizing is the user's decision; never restore from this loop.
    if (!satellite || !visible(satellite)) return
    try {
      parked = await parkCompanionBesideMain(parked) || parked
    } catch (error) { console.warn('[Companion] Dashboard follow failed', error) }
    if (generation === followGeneration && active() && Date.now() < deadline) window.setTimeout(() => void tick(), 700)
  }
  window.setTimeout(() => void tick(), 700)
}

export async function openCraftCompanion(info?: CraftGameInfo, active: () => boolean = () => true, source: CraftOpenSource = 'header_button') {
  if (!isOverwolf()) {
    const opened = window.open('/?window=companion', 'companion', 'width=440,height=739')
    if (opened) trackCraftWindow(EVENTS.CRAFT_WINDOW_OPENED, 'companion', { source })
    return
  }
  const layout = await monitors()
  if (!active()) return
  await restoreWindow('companion')
  if (!active()) { await hideWindow('companion'); return }
  trackCraftWindow(EVENTS.CRAFT_WINDOW_OPENED, 'companion', { source })
  const sourceMonitor = layout.displays.find((display) => info?.monitorHandle?.value != null && display.handle?.value === info.monitorHandle.value)
    ?? layout.displays.find((display) => display.is_primary) ?? layout.displays[0]
  const target = layout.displays.find((display) => display !== sourceMonitor) ?? sourceMonitor
  if (target) {
    await centerWindowOnMonitor('companion', target, layout.workingArea)

  }
  if (active()) {
    const parked = await parkCompanionBesideMain()
    if (!active()) return
    await surfaceWindowOverExternalApp('companion')
    followMainAfterLaunch(active, parked)
  }
}

export async function autoLaunchDesktopCompanion(active: () => boolean) {
  const allowed = () => active() && readPreferences().autoLaunchCompanion && canAutoLaunchCraftCompanion()
  if (!allowed()) return
  const layout = await monitors()
  if (layout.displays.length >= 2 && allowed()) {
    await openCraftCompanion(undefined, allowed, 'desktop_auto_launch')
  }
}

export async function toggleCraftCompanion() {
  const current = await getOpenWindow('companion')
  if (current && ['normal', 'maximized'].includes(current.stateEx ?? current.state ?? '')) {
    await requestCraftWindowClose('companion')
    return
  }
  const info = await new Promise<CraftGameInfo>((resolve) => overwolf.games.getRunningGameInfo((result) => resolve(result ?? {})))
  await openCraftCompanion(info, () => true, 'hotkey')
}

/** Called once per game session. The in-game craft overlay is hotkey-only. */
export async function autoLaunchCraftCompanionForGame(info: CraftGameInfo, active: () => boolean) {
  const companionAllowed = () => active() && readPreferences().autoLaunchCompanion && canAutoLaunchCraftCompanion()
  if (!companionAllowed()) return
  const layout = await monitors()
  if (!companionAllowed()) return
  if (layout.displays.length >= 2) {
    let current = info
    for (let attempt = 0; current.monitorHandle?.value == null && attempt < 12 && companionAllowed(); attempt++) {
      await new Promise((resolve) => window.setTimeout(resolve, 500))
      current = await new Promise<CraftGameInfo>((resolve) => overwolf.games.getRunningGameInfo((result) => resolve(result ?? {})))
    }
    if (companionAllowed()) await openCraftCompanion(current, companionAllowed, 'game_auto_launch')
  }
}
