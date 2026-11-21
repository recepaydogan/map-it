import { AlertTriangle, RefreshCw, X } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppToastStore, type AppToast, type AppToastKind } from '../store/app-toast-store'

const AUTO_DISMISS_MS = 7_000

const iconByKind: Record<AppToastKind, typeof AlertTriangle> = {
  'tracker-restart-required': RefreshCw,
  'tracker-failed': AlertTriangle,
}

const toneByKind: Record<AppToastKind, string> = {
  'tracker-restart-required': 'text-[var(--accent-text)]',
  'tracker-failed': 'text-amber-300',
}

/** Bottom-left of the content column, clear of the ad rail and the map controls. */
export function AppToasts() {
  const toasts = useAppToastStore((state) => state.toasts)
  const dismiss = useAppToastStore((state) => state.dismiss)

  useEffect(() => {
    const timers = toasts
      .filter((toast) => !toast.sticky)
      .map((toast) => window.setTimeout(
        () => dismiss(toast.id),
        Math.max(1_000, AUTO_DISMISS_MS - (Date.now() - toast.createdAt)),
      ))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [dismiss, toasts])

  return <AppToastList toasts={toasts} onDismiss={dismiss} />
}

export function AppToastList({ toasts, onDismiss }: { toasts: AppToast[]; onDismiss: (id: string) => void }) {
  const { t } = useTranslation()
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-1.5" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = iconByKind[toast.kind]
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex w-[min(420px,calc(100vw-2rem))] items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--overlay-background)] px-3 py-2.5 shadow-2xl backdrop-blur-xl"
          >
            <Icon size={15} className={`mt-0.5 shrink-0 ${toneByKind[toast.kind]}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-semibold text-[var(--text)]">
                {t(`tracking.autoInstall.${toast.kind}.title`)}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted)]">
                {t(`tracking.autoInstall.${toast.kind}.body`, {
                  detail: toast.detail ? t(`tracking.errors.${toast.detail}`, { defaultValue: toast.detail }) : '',
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label={t('planner.notifications.dismiss')}
              className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] hover:text-[var(--text)]"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
