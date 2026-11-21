import { useEffect } from 'react'
import { startSubscriptionCallbackRelay } from '../features/subscriptions/subscription-callback'
import {
  hideWindow,
  getOpenWindow,
  restoreWindow,
  restoreWindowPreservingPlacement,
  revealWindow,
  sendWindowToBack,
  toggleWindow,
} from '../overwolf-utils/window-manager'
import { readPreferences } from '../store/preferences'
import { toggleCraftOverlay } from '../overwolf-utils/craft-close-request'
import { isOverwolf } from '../utils/overwolf'
import { EVENTS } from '../lib/analytics/events'
import { setGameRunning, track } from '../lib/analytics/analytics'
import { startLivePositionAnalytics } from '../lib/live-tracking/live-position-analytics'
import { clearDesktopMapFollow, startDesktopMapFollow } from '../lib/live-tracking/desktop-map-follow'
import { autoLaunchCraftCompanionForGame, autoLaunchDesktopCompanion, showCraftHotkeyHint, toggleCraftCompanion } from '../overwolf-utils/craft-window-launcher'
import {
  beginMapOverlayGameSession,
  blockMapOverlayAutoLaunchForSession,
  endMapOverlayGameSession,
} from '../overwolf-utils/map-overlay-session'

const VALHEIM_CLASS_ID = 21668
const OPEN_APP_TRAY_ITEM_ID = 'open_valheim_map'
const EXIT_APP_TRAY_ITEM_ID = 'exit_valheim_map'
const CRAFT_HINT_DURATION_MS = 8_000
const BOOT_GAME_INFO_RETRY_DELAY_MS = 3_000
const IN_GAME_AUTO_OPEN_DELAY_MS = 15_000

type GameRuntimeInfo = {
  isRunning?: boolean
  classId?: number
  id?: number
  monitorHandle?: { value?: number }
}

const isValheimGame = (gameInfo: GameRuntimeInfo | null | undefined): boolean =>
  Boolean(gameInfo && (
    gameInfo.classId === VALHEIM_CLASS_ID ||
    (typeof gameInfo.id === 'number' && Math.floor(gameInfo.id / 10) === VALHEIM_CLASS_ID)
  ))

const isValheimRunning = (gameInfo: GameRuntimeInfo | null | undefined): boolean =>
  Boolean(gameInfo?.isRunning && isValheimGame(gameInfo))

/** Kill switch for the in-game mini-map overlay (game-launch sync and hotkey). */
const OVERLAY_DISABLED = false

const syncOverlayWithGame = (gameInfo: GameRuntimeInfo | null | undefined): void => {
  const preferences = readPreferences()
  const running = isValheimRunning(gameInfo)
  console.info(`[Background] overlay sync: valheim=${running} enabled=${preferences.overlayEnabled} autoShow=${preferences.autoShowOverlay} disabled=${OVERLAY_DISABLED}`)
  if (!running) {
    endMapOverlayGameSession()
    void hideWindow('overlay').catch((error) =>
      console.error('[Background] Failed to hide overlay after game exit', error),
    )
    return
  }

  const shouldAutoLaunch = beginMapOverlayGameSession()
  if (!OVERLAY_DISABLED && shouldAutoLaunch && preferences.overlayEnabled && preferences.autoShowOverlay) {
    restoreWindow('overlay')
      .then(() => console.info('[Background] overlay restored'))
      .catch((error) => console.error('[Background] Failed to show overlay after game launch', error))
  }
}

export function BackgroundController() {
  useEffect(() => startSubscriptionCallbackRelay(), [])
  useEffect(() => {
    if (!isOverwolf()) return
    clearDesktopMapFollow()

    let craftGameRunning = false
    let disposed = false
    let craftLaunchGeneration = 0
    let craftHintTimer: number | undefined
    let desktopGameRunning = false
    let desktopLaunchGeneration = 0
    let pendingDesktopBackgroundOpen: Promise<void> | null = null
    let openDesktopAfterGameExit = false
    let manuallyRaisedDuringGame = false
    let bootGameInfoRetryTimer: number | undefined
    let inGameAutoOpenTimer: number | undefined
    let inGameAutoOpenGeneration = 0
    const getMonitorCount = () => new Promise<number>((resolve) => {
      overwolf.utils.getMonitorsList((result) => resolve(result?.displays?.length ?? 0))
    })
    const revealMainManually = () => {
      // A tray click, dock launch or hotkey is an explicit request, even in game.
      desktopLaunchGeneration++
      openDesktopAfterGameExit = false
      if (desktopGameRunning) manuallyRaisedDuringGame = true
      void (async () => {
        await pendingDesktopBackgroundOpen?.catch(() => {})
        await revealWindow('main')
      })().catch((error) =>
        console.error('[Background] Failed to reveal main window', error),
      )
    }
    const cancelInGameAutoOpen = () => {
      inGameAutoOpenGeneration++
      if (inGameAutoOpenTimer !== undefined) window.clearTimeout(inGameAutoOpenTimer)
      inGameAutoOpenTimer = undefined
    }
    const scheduleInGameAutoOpen = () => {
      cancelInGameAutoOpen()
      const generation = inGameAutoOpenGeneration
      inGameAutoOpenTimer = window.setTimeout(() => {
        inGameAutoOpenTimer = undefined
        if (disposed || generation !== inGameAutoOpenGeneration || !desktopGameRunning || !readPreferences().autoOpenInGameApp) return
        void getMonitorCount().then((count) => {
          if (disposed || generation !== inGameAutoOpenGeneration || !desktopGameRunning || count !== 1 || !readPreferences().autoOpenInGameApp) return
          overwolf.games.getRunningGameInfo((info) => {
            if (disposed || generation !== inGameAutoOpenGeneration || !desktopGameRunning || !isValheimRunning(info) || !readPreferences().autoOpenInGameApp) return
            void revealWindow('in_game').catch((error) => console.error('[Background] Failed to auto-open in-game app', error))
          })
        }).catch((error) => console.error('[Background] Failed to check monitors for in-game app', error))
      }, IN_GAME_AUTO_OPEN_DELAY_MS)
    }
    const syncDesktopWithGame = (running: boolean) => {
      if (running === desktopGameRunning) return
      desktopGameRunning = running
      const generation = ++desktopLaunchGeneration
      manuallyRaisedDuringGame = false
      if (bootGameInfoRetryTimer !== undefined) window.clearTimeout(bootGameInfoRetryTimer)
      bootGameInfoRetryTimer = undefined
      if (!running) {
        cancelInGameAutoOpen()
        void hideWindow('in_game').catch((error) => console.error('[Background] Failed to hide in-game app after game exit', error))
        const shouldOpen = openDesktopAfterGameExit
        openDesktopAfterGameExit = false
        if (shouldOpen) {
          void (async () => {
            await pendingDesktopBackgroundOpen?.catch(() => {})
            if (disposed || generation !== desktopLaunchGeneration || desktopGameRunning) return
            await revealWindow('main')
          })().catch((error) =>
            console.error('[Background] Failed to open main after game exit', error),
          )
        }
        return
      }
      scheduleInGameAutoOpen()
      void getMonitorCount().then(async (count) => {
        if (disposed || generation !== desktopLaunchGeneration || !desktopGameRunning) return
        if (count === 1) {
          openDesktopAfterGameExit = true
          const open = (async () => {
            await restoreWindowPreservingPlacement('main')
            if (disposed || generation !== desktopLaunchGeneration || !desktopGameRunning) return
            await sendWindowToBack('main')
          })()
          pendingDesktopBackgroundOpen = open
          try { await open } finally { if (pendingDesktopBackgroundOpen === open) pendingDesktopBackgroundOpen = null }
        } else if (count > 1) {
          void restoreWindowPreservingPlacement('main').catch((error) =>
            console.error('[Background] Failed to open main on game start', error),
          )
        }
      }).catch((error) => console.error('[Background] Failed to check monitor count', error))
    }
    const syncCraftWindows = (info: GameRuntimeInfo | null | undefined) => {
      const running = isValheimRunning(info)
      if (running === craftGameRunning) return
      craftGameRunning = running
      const generation = ++craftLaunchGeneration
      if (craftHintTimer !== undefined) window.clearTimeout(craftHintTimer)
      craftHintTimer = undefined
      const active = () => craftGameRunning && generation === craftLaunchGeneration
      if (running) {
        void showCraftHotkeyHint(info ?? {}, active).then(() => {
          if (!active()) return
          craftHintTimer = window.setTimeout(() => {
            if (active()) void hideWindow('craft_hint').catch(console.error)
          }, CRAFT_HINT_DURATION_MS)
        }).catch((error) => console.error('[Background] Failed to show craft hotkey hint', error))
        void autoLaunchCraftCompanionForGame(info ?? {}, active).catch(console.error)
      }
      else {
        void hideWindow('craft_overlay').catch(console.error)
        void hideWindow('craft_hint').catch(console.error)
      }
    }
    const openMainWindow = revealMainManually

    const exitApp = () => {
      overwolf.os.tray.destroy()
      overwolf.windows.getCurrentWindow((result) => {
        if (!result?.success || !result.window) {
          console.error('[Background] Failed to resolve background window while exiting', result?.error)
          return
        }
        overwolf.windows.close(result.window.id, (closeResult) => {
          if (closeResult && !closeResult.success) {
            console.error('[Background] Failed to exit from system tray', closeResult.error)
          }
        })
      })
    }

    const onTrayMenuItemClicked = (event: overwolf.os.tray.onMenuItemClickedEvent) => {
      if (event.item === OPEN_APP_TRAY_ITEM_ID) openMainWindow()
      if (event.item === EXIT_APP_TRAY_ITEM_ID) exitApp()
    }

    const onTrayIconClicked = () => {
      openMainWindow()
    }
    const onWindowStateChanged = (event: overwolf.windows.WindowStateChangedEvent) => {
      if (event.window_name !== 'in_game') return
      const state = event.window_state_ex ?? event.window_state
      if (state === 'normal' || state === 'maximized' || state === 'hidden' || state === 'closed') {
        cancelInGameAutoOpen()
      }
    }

    const onHotkeyPressed = (event: overwolf.settings.hotkeys.OnPressedEvent) => {
      if (event.name === 'toggle_craft_overlay') void toggleCraftOverlay().catch(console.error)
      if (event.name === 'toggle_companion') void toggleCraftCompanion().catch(console.error)
      if (event.name === 'toggle_app') {
        if (desktopGameRunning && !manuallyRaisedDuringGame) revealMainManually()
        else {
          desktopLaunchGeneration++
          openDesktopAfterGameExit = false
          manuallyRaisedDuringGame = false
          void (pendingDesktopBackgroundOpen ?? Promise.resolve()).catch(() => {}).then(() => toggleWindow('main')).catch((error) =>
            console.error('[Background] Failed to toggle main window', error),
          )
        }
      }
      if (event.name === 'toggle_in_game_app') {
        overwolf.games.getRunningGameInfo((info) => {
          if (!isValheimRunning(info)) return
          void getOpenWindow('in_game').then((current) => {
            const state = current?.stateEx ?? current?.state
            if (current && (state === 'normal' || state === 'maximized')) {
              void hideWindow('in_game').catch(console.error)
            } else {
              void revealWindow('in_game').catch(console.error)
            }
          })
        })
      }

      if (event.name === 'toggle_overlay') {
        if (OVERLAY_DISABLED || !readPreferences().overlayEnabled) return
        void getOpenWindow('overlay').then(async (current) => {
          const state = current?.stateEx ?? current?.state
          if (current && (state === 'normal' || state === 'maximized')) {
            blockMapOverlayAutoLaunchForSession()
            await hideWindow('overlay')
          } else {
            await restoreWindow('overlay')
          }
        }).catch((error) => console.error('[Background] Failed to toggle overlay window', error))
      }
    }

    let stopLivePositionAnalytics: (() => void) | null = null
    const setLivePositionAnalyticsRunning = (running: boolean): void => {
      if (running && !stopLivePositionAnalytics) {
        stopLivePositionAnalytics = startLivePositionAnalytics(() => startDesktopMapFollow())
        return
      }
      if (!running) {
        stopLivePositionAnalytics?.()
        stopLivePositionAnalytics = null
        clearDesktopMapFollow()
      }
    }

    const onGameInfoUpdated = (event: overwolf.games.GameInfoUpdatedEvent) => {
      syncOverlayWithGame(event.gameInfo)
      syncCraftWindows(event.gameInfo)

      if (event.runningChanged && (isValheimGame(event.gameInfo) || (!event.gameInfo && desktopGameRunning))) {
        const running = isValheimRunning(event.gameInfo)
        syncDesktopWithGame(running)
        setGameRunning(running, running ? 'Valheim' : null)
        if (running) {
          track(EVENTS.GAME_STARTED)
        } else {
          track(EVENTS.GAME_STOPPED)
        }
        setLivePositionAnalyticsRunning(running)
      }

    }

    const onAppLaunchTriggered = (event: overwolf.extensions.AppLaunchTriggeredEvent) => {
      const gameLaunch = /gamelaunchevent/i.test(String(event.origin ?? ''))
      overwolf.games.getRunningGameInfo((info) => {
        if (disposed) return
        if (isValheimRunning(info)) {
          syncDesktopWithGame(true)
          setLivePositionAnalyticsRunning(true)
        }
        if (!gameLaunch) revealMainManually()
        if (isValheimRunning(info)) syncCraftWindows(info)
        else void autoLaunchDesktopCompanion(() => !disposed && !craftGameRunning).catch(console.error)
      })
    }

    overwolf.settings.hotkeys.onPressed.addListener(onHotkeyPressed)
    overwolf.games.onGameInfoUpdated.addListener(onGameInfoUpdated)
    overwolf.extensions.onAppLaunchTriggered.addListener(onAppLaunchTriggered)
    overwolf.os.tray.onMenuItemClicked.addListener(onTrayMenuItemClicked)
    overwolf.os.tray.onTrayIconClicked.addListener(onTrayIconClicked)
    overwolf.os.tray.onTrayIconDoubleClicked.addListener(onTrayIconClicked)
    overwolf.windows.onStateChanged.addListener(onWindowStateChanged)
    overwolf.os.tray.setMenu(
      {
        menu_items: [
          { id: OPEN_APP_TRAY_ITEM_ID, label: 'Open Valheim Map' },
          { label: '-' },
          { id: EXIT_APP_TRAY_ITEM_ID, label: 'Exit' },
        ],
      },
      (result) => {
        if (result && !result.success) {
          console.error('[Background] Failed to create system tray icon', result.error)
        }
      },
    )

    // A cold GameLaunch can precede game-info availability. Wait briefly before
    // showing the desktop window, so a single-monitor launch opens behind the game.
    const source = new URLSearchParams(window.location.search).get('source')?.toLowerCase()
    overwolf.games.getRunningGameInfo((result) => {
      if (disposed) return
      syncOverlayWithGame(result)
      syncCraftWindows(result)
      const running = isValheimRunning(result)
      if (running) syncDesktopWithGame(true)
      if (!running) void autoLaunchDesktopCompanion(() => !disposed && !craftGameRunning).catch(console.error)
      setGameRunning(running, running ? 'Valheim' : null)
      setLivePositionAnalyticsRunning(running)
      if (source && source !== 'gamelaunchevent') { revealMainManually(); return }
      if (!running) bootGameInfoRetryTimer = window.setTimeout(() => {
        bootGameInfoRetryTimer = undefined
        if (disposed || desktopGameRunning) return
        overwolf.games.getRunningGameInfo((latest) => {
          if (disposed || desktopGameRunning) return
          if (isValheimRunning(latest)) {
            syncDesktopWithGame(true)
            setLivePositionAnalyticsRunning(true)
          } else if (source !== 'gamelaunchevent') revealMainManually()
        })
      }, BOOT_GAME_INFO_RETRY_DELAY_MS)
    })

    return () => {
      disposed = true
      craftGameRunning = false
      craftLaunchGeneration++
      desktopLaunchGeneration++
      cancelInGameAutoOpen()
      if (bootGameInfoRetryTimer !== undefined) window.clearTimeout(bootGameInfoRetryTimer)
      if (craftHintTimer !== undefined) window.clearTimeout(craftHintTimer)
      overwolf.settings.hotkeys.onPressed.removeListener(onHotkeyPressed)
      overwolf.games.onGameInfoUpdated.removeListener(onGameInfoUpdated)
      overwolf.extensions.onAppLaunchTriggered.removeListener(onAppLaunchTriggered)
      overwolf.os.tray.onMenuItemClicked.removeListener(onTrayMenuItemClicked)
      overwolf.os.tray.onTrayIconClicked.removeListener(onTrayIconClicked)
      overwolf.os.tray.onTrayIconDoubleClicked.removeListener(onTrayIconClicked)
      overwolf.windows.onStateChanged.removeListener(onWindowStateChanged)
      stopLivePositionAnalytics?.()
      overwolf.os.tray.destroy()
    }
  }, [])

  return null
}
