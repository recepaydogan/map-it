import DashboardWindowChrome from './layout/dashboard-window-chrome'
import {
  Copy,
  Minus,
  Square,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  dragCurrentWindow,
  hideWindow,
  minimizeWindow,
  toggleMaximizeWindow,
} from '../overwolf-utils/window-manager'

function bindWindowDrag(element: HTMLElement | null) {
  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return
    if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea, [data-ow-no-drag]')) return
    dragCurrentWindow()
  }
  element?.addEventListener('mousedown', onMouseDown)
  return () => element?.removeEventListener('mousedown', onMouseDown)
}

export type MainSurface = 'map' | 'database' | 'planner' | 'operations' | 'building' | 'settings' | 'account' | 'faq' | 'support' | 'whats-new'

type AppHeaderProps = {
  standaloneDashboard?: boolean
  windowName?: 'main' | 'in_game'
}

export function AppHeader({ standaloneDashboard = false, windowName = 'main' }: AppHeaderProps) {
  const { t } = useTranslation()
  const [isMaximized, setIsMaximized] = useState(false)
  const runWindowAction = (action: Promise<void>, label: string) => {
    void action.catch((error) => console.error(`[Window] Failed to ${label}`, error))
  }

  const handleMinimize = () => runWindowAction(
    windowName === 'in_game' ? hideWindow(windowName) : minimizeWindow(windowName),
    'minimize window',
  )
  const handleMaximize = () => {
    void toggleMaximizeWindow(windowName)
      .then(() => setIsMaximized((value) => !value))
      .catch((error) => console.error('[Window] Failed to resize main window', error))
  }
  const handleClose = () => runWindowAction(hideWindow(windowName), 'hide window')

  if (standaloneDashboard) {
    return (
      <DashboardWindowChrome
        maximized={isMaximized}
        labelPrefix="window"
        onMinimize={handleMinimize}
        onMaximize={handleMaximize}
        onClose={handleClose}
        bindDrag={bindWindowDrag}
      />
    )
  }

  return (
    <header
      className="relative z-40 grid h-10 shrink-0 grid-cols-[minmax(0,1fr)_440px] bg-[var(--background)]"
    >
      <div className="flex min-w-0 items-center" onMouseDown={dragCurrentWindow}>
        <div className="flex h-full w-16 shrink-0 items-center justify-center">
          <img src="/icon.png" alt="" width={28} height={28} draggable={false} className="size-7" />
        </div>
      </div>

      <div className="flex h-full items-center" onMouseDown={dragCurrentWindow}>
        <div className="flex-1" />
        <div className="flex h-full items-center" onMouseDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            onClick={handleMinimize}
            className="grid h-full w-10 place-items-center text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]"
            aria-label={t('window.minimize')}
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleMaximize}
            className="grid h-full w-10 place-items-center text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]"
            aria-label={t(isMaximized ? 'window.restore' : 'window.maximize')}
          >
            {isMaximized ? <Copy size={13} aria-hidden="true" /> : <Square size={13} aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="grid h-full w-10 place-items-center text-[var(--muted)] hover:bg-[var(--danger)] hover:text-white"
            aria-label={t('window.close')}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  )
}
