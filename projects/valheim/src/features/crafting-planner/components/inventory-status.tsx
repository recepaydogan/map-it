import { AlertTriangle, CircleOff, Clock, PackageSearch, Radio, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNow } from '../../../hooks/use-now.ts'
import { cn } from '../../../lib/cn'
import type { InventoryStatus } from '../../../lib/live-tracking/inventory-types.ts'
import { relativeAgeKey } from '../planner-presentation.ts'

export interface InventoryStatusActions {
  /** Opens the position tracking installer dialog. */
  onInstallTracker: () => void
  onEnableInventory: () => void
  onDisableInventory: () => void
}

interface InventoryStatusProps extends InventoryStatusActions {
  status: InventoryStatus
  updatedAt: number | null
  error: string | null
  /** Which character and world the counts belong to. */
  scope?: { characterName: string; worldName: string } | null
}

type Tone = 'live' | 'neutral' | 'warning'

const STALE_BADGE_AGE_MS = 48 * 60 * 60 * 1000

const toneByStatus: Record<InventoryStatus, Tone> = {
  live: 'live',
  stale: 'warning',
  waiting: 'neutral',
  disabled: 'neutral',
  'unsupported-host': 'neutral',
  'tracker-missing': 'neutral',
  'sharing-off': 'neutral',
  'mod-update-required': 'warning',
  'unsupported-payload': 'warning',
  invalid: 'warning',
}

const iconByStatus: Record<InventoryStatus, typeof Radio> = {
  live: Radio,
  stale: Clock,
  waiting: RefreshCw,
  disabled: PackageSearch,
  'unsupported-host': CircleOff,
  'tracker-missing': PackageSearch,
  'sharing-off': CircleOff,
  'mod-update-required': AlertTriangle,
  'unsupported-payload': AlertTriangle,
  invalid: AlertTriangle,
}

const toneClass: Record<Tone, string> = {
  live: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200',
  neutral: 'border-[var(--border)] bg-black/20 text-[var(--muted)]',
  warning: 'border-amber-500/35 bg-amber-500/10 text-amber-200',
}

/** Re-renders on the shared clock so "updated 3 minutes ago" stays honest. */
function useAgeLabel(updatedAt: number | null) {
  const { t } = useTranslation()
  const now = useNow()
  if (updatedAt === null) return ''
  const { key, value } = relativeAgeKey(Math.max(0, now - updatedAt))
  return t(`planner.inventory.age.${key}`, { count: value })
}

export function InventoryStatusChip({
  status,
  updatedAt,
  error,
  scope,
  onInstallTracker,
  onEnableInventory,
  onDisableInventory,
}: InventoryStatusProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ageLabel = useAgeLabel(updatedAt)
  const now = useNow()
  const Icon = iconByStatus[status]
  const detailId = `inventory-status-${status}`

  if (status === 'live' || (status === 'stale' && (updatedAt === null || now - updatedAt <= STALE_BADGE_AGE_MS))) {
    return null
  }

  const action = (() => {
    switch (status) {
      case 'tracker-missing':
        return { label: t('planner.inventory.actions.installTracker'), run: onInstallTracker }
      case 'mod-update-required':
        return { label: t('planner.inventory.actions.updateTracker'), run: onInstallTracker }
      case 'disabled':
      case 'sharing-off':
        return { label: t('planner.inventory.actions.enable'), run: onEnableInventory }
      case 'stale':
      case 'waiting':
      case 'invalid':
        return { label: t('planner.inventory.actions.disable'), run: onDisableInventory }
      default:
        return null
    }
  })()

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={detailId}
        className={cn(
          'flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--radius-full)] border px-2.5 text-[10.5px] font-semibold',
          toneClass[toneByStatus[status]],
        )}
      >
        <Icon size={12} aria-hidden="true" />
        {t(`planner.inventory.status.${status}`)}
      </button>
      {open ? (
        <div
          id={detailId}
          className="absolute right-0 top-9 z-30 w-[290px] rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--overlay-background)] p-3 shadow-2xl backdrop-blur-xl"
        >
          <p className="text-[11px] font-semibold text-[var(--text)]">{t(`planner.inventory.status.${status}`)}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
            {t(`planner.inventory.explain.${status}`)}
          </p>
          {scope && status === 'stale' ? (
            <p className="mt-1.5 text-[10.5px] text-[var(--muted)]">
              {t('planner.inventory.scope', {
                character: scope.characterName || t('planner.inventory.unknownCharacter'),
                world: scope.worldName || t('planner.inventory.unknownWorld'),
              })}
            </p>
          ) : null}
          {status === 'stale' && updatedAt !== null ? (
            <p className="mt-1.5 text-[10px] text-amber-200">{t('planner.inventory.staleNotice', { age: ageLabel })}</p>
          ) : null}
          {error ? <p className="mt-1.5 text-[10px] text-red-300">{t(`tracking.errors.${error}`, { defaultValue: t('tracking.errors.unknown') })}</p> : null}
          {action ? (
            <button
              type="button"
              onClick={() => { setOpen(false); action.run() }}
              className="mt-3 h-8 w-full cursor-pointer rounded-[var(--radius-md)] border border-[var(--border)] bg-black/25 text-[11px] font-semibold text-[var(--text)] hover:border-[var(--accent)]"
            >
              {action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Shown inside the checklist while nothing is being read from the game. It
 * states plainly that owned amounts are the ones the player entered, so a zero
 * is never mistaken for "the game says you have none".
 */
export function ManualModeNotice({
  status,
  onInstallTracker,
  onEnableInventory,
}: Pick<InventoryStatusProps, 'status' | 'onInstallTracker' | 'onEnableInventory'>) {
  const { t } = useTranslation()
  if (status === 'live' || status === 'stale') return null
  const canEnable = status === 'disabled' || status === 'sharing-off'
  const canInstall = status === 'tracker-missing' || status === 'mod-update-required'

  return (
    <div className="mb-3 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-black/20 px-3 py-2.5">
      <PackageSearch size={15} className="mt-0.5 shrink-0 text-[var(--accent-text)]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] font-semibold text-[var(--text)]">{t('planner.inventory.manualTitle')}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted)]">
          {t('planner.inventory.manualDescription')}
        </p>
      </div>
      {canEnable || canInstall ? (
        <button
          type="button"
          onClick={canInstall ? onInstallTracker : onEnableInventory}
          className="shrink-0 cursor-pointer rounded-[var(--radius-md)] border border-[var(--border)] bg-black/25 px-2.5 py-1.5 text-[10.5px] font-semibold text-[var(--text)] hover:border-[var(--accent)]"
        >
          {canInstall
            ? t('planner.inventory.actions.installTracker')
            : t('planner.inventory.actions.enable')}
        </button>
      ) : null}
    </div>
  )
}
