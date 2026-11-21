import { Minus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { closeWindow, dragCurrentWindow, hideWindow, minimizeWindow, type AppWindowName } from '../overwolf-utils/window-manager'

type WindowHeaderProps = {
  title: string
  windowName: AppWindowName
  hideOnClose?: boolean
  className?: string
}

export function WindowHeader({ title, windowName, hideOnClose = false, className }: WindowHeaderProps) {
  const { t } = useTranslation()

  return (
    <header className={cn('flex h-12 shrink-0 items-center border-b border-[var(--border)] bg-[var(--surface)]', className)}>
      <button
        type="button"
        className="h-full flex-1 cursor-move select-none px-4 text-left text-sm font-semibold text-[var(--text)]"
        onMouseDown={dragCurrentWindow}
      >
        {title}
      </button>
      <button
        type="button"
        aria-label={t('window.minimize')}
        className="grid h-full w-12 cursor-pointer place-items-center text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        onClick={() => void minimizeWindow(windowName)}
      >
        <Minus size={17} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={t(hideOnClose ? 'window.hide' : 'window.close')}
        className="grid h-full w-12 cursor-pointer place-items-center text-[var(--muted)] transition-colors hover:bg-[var(--danger)] hover:text-white"
        onClick={() => void (hideOnClose ? hideWindow(windowName) : closeWindow(windowName))}
      >
        <X size={17} aria-hidden="true" />
      </button>
    </header>
  )
}
