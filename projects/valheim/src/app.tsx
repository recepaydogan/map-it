import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthProvider } from './features/account/auth-provider'
import { getCurrentWindowName } from './utils/overwolf'
import { MainWindow } from './windows/main-window'
import { OverlayWindow } from './windows/overlay-window'
import { CompanionWindow } from './windows/companion-window'
import { InGameCraftWindow } from './windows/in-game-craft-window'
import { CraftHotkeyHintWindow } from './windows/craft-hotkey-hint-window'
import { initAnalytics, track } from './lib/analytics/analytics'
import { EVENTS } from './lib/analytics/events'
import type { AnalyticsSurface } from './lib/analytics/app-context'

export function App() {
  const { t } = useTranslation()
  const [windowName, setWindowName] = useState<string | null>(null)

  useEffect(() => {
    document.title = t('app.name')
    void getCurrentWindowName().then((name) => {
      document.body.style.backgroundColor = name === 'main' ? 'var(--background)' : ''
      setWindowName(name)
      // The ephemeral hint is UI chrome, not an app-open surface.
      if (name && name !== 'craft_hint') {
        const surface: AnalyticsSurface = name === 'in_game' || name === 'overlay' || name === 'craft_overlay' ? 'in_game' : 'desktop'
        initAnalytics(surface)
        track(EVENTS.APP_OPENED)
      }
    })
  }, [t])

  if (!windowName) return null
  // The account session lives at the window root: the header's account tab and
  // every future account-aware surface read it through useAuth().
  if (windowName === 'main' || windowName === 'in_game') {
    return (
      <AuthProvider>
        <MainWindow inGame={windowName === 'in_game'} />
      </AuthProvider>
    )
  }
  if (windowName === 'overlay') return <OverlayWindow />
  if (windowName === 'companion') return <CompanionWindow />
  if (windowName === 'craft_overlay') return <InGameCraftWindow />
  if (windowName === 'craft_hint') return <CraftHotkeyHintWindow />

  return <main className="grid h-screen place-items-center bg-[var(--background)] text-[var(--text)]">{t('errors.unknownWindow')}</main>
}
