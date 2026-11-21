import { CheckCircle2, PartyPopper, X } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlannerNotificationStore } from '../../../store/planner-notification-store.ts'

const AUTO_DISMISS_MS = 6_000

/**
 * Sits inside the planner column, so it never reaches into the reserved ad rail.
 */
export function PlannerToasts() {
  const { t } = useTranslation()
  const notifications = usePlannerNotificationStore((state) => state.notifications)
  const dismiss = usePlannerNotificationStore((state) => state.dismiss)

  useEffect(() => {
    if (notifications.length === 0) return
    const timers = notifications.map((notification) => window.setTimeout(
      () => dismiss(notification.id),
      Math.max(1_000, AUTO_DISMISS_MS - (Date.now() - notification.createdAt)),
    ))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [dismiss, notifications])

  if (notifications.length === 0) return null

  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-30 flex flex-col gap-1.5" aria-live="polite">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="pointer-events-auto flex max-w-[320px] items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--overlay-background)] px-3 py-2.5 shadow-2xl backdrop-blur-xl"
        >
          {notification.kind === 'plan-completed'
            ? <PartyPopper size={15} className="mt-0.5 shrink-0 text-[var(--accent-text)]" aria-hidden="true" />
            : <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />}
          <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-[var(--text)]">
            {t(`planner.notifications.${notification.kind}`, { name: notification.name })}
          </p>
          <button
            type="button"
            onClick={() => dismiss(notification.id)}
            aria-label={t('planner.notifications.dismiss')}
            className="grid size-5 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] hover:text-[var(--text)]"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}
