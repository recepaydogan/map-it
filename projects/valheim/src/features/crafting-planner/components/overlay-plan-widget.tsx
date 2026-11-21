import { ChevronDown, ClipboardList, ExternalLink, PackageSearch } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { useLiveInventory } from '../../../hooks/use-live-inventory.ts'
import {
  selectActivePlan,
  useCraftingPlannerStore,
  type CraftingPlan,
} from '../../../store/crafting-planner-store.ts'
import { usePlanCalculation } from '../hooks/use-plan-calculation.ts'
import { usePlannerCatalog } from '../hooks/use-planner-catalog.ts'
import { ProgressRing } from './progress-ring.tsx'

interface OverlayPlanWidgetProps {
  onOpenPlanner: () => void
}

const VISIBLE_MATERIALS = 3

function EmptyBar({ onOpenPlanner }: OverlayPlanWidgetProps) {
  const { t } = useTranslation()
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2.5">
      <ClipboardList size={15} className="shrink-0 text-[var(--accent-text)]" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--muted)]">{t('planner.overlay.noPlan')}</p>
      <button
        type="button"
        onClick={onOpenPlanner}
        className="shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/25 px-2.5 py-1 text-[10.5px] font-semibold text-[var(--text)] hover:border-[var(--accent)]"
      >
        {t('planner.overlay.open')}
      </button>
    </div>
  )
}

/**
 * Mounted only when there is something to show, which keeps the recipe catalog
 * and the inventory poll out of the overlay for players who never opened the
 * planner.
 */
function OverlayPlanContent({ plan, onOpenPlanner }: OverlayPlanWidgetProps & { plan: CraftingPlan }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(true)
  const catalog = usePlannerCatalog()
  const inventory = useLiveInventory(false)

  const calculation = usePlanCalculation({
    graph: catalog.graph,
    plan,
    liveStock: inventory.stock,
    liveAuthoritative: inventory.authoritative,
  })

  if (!calculation) return <EmptyBar onOpenPlanner={onOpenPlanner} />

  const missing = calculation.materials.filter((material) => material.missing > 0)

  return (
    <section className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        <ProgressRing
          size={28}
          completion={calculation.totals.completion}
          label={t('planner.header.progressLabel', { percent: Math.round(calculation.totals.completion * 100) })}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-[var(--text)]">{plan.name}</p>
          <p className="mt-0.5 truncate text-[10px] text-[var(--muted)]">
            {missing.length === 0
              ? t('planner.overlay.ready')
              : t('planner.overlay.remaining', { count: missing.length })}
            {inventory.status === 'live' ? ` · ${t('planner.inventory.status.live')}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenPlanner}
          aria-label={t('planner.overlay.open')}
          className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/25 text-[var(--muted)] hover:text-[var(--text)]"
        >
          <ExternalLink size={12} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={t(expanded ? 'planner.overlay.collapse' : 'planner.overlay.expand')}
          className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] hover:bg-white/[0.07] hover:text-[var(--text)]"
        >
          <ChevronDown size={14} className={cn('transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
        </button>
      </div>

      {expanded ? (
        <ul className="space-y-1 border-t border-[var(--border)] px-4 py-2">
          {missing.length === 0 ? (
            <li className="py-1 text-[11px] text-[var(--muted)]">{t('planner.empty.readyToCraftTitle')}</li>
          ) : missing.slice(0, VISIBLE_MATERIALS).map((material) => (
            <li key={material.prefabName} className="flex items-center gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-black/25">
                {material.item?.icon
                  ? <img src={material.item.icon} alt="" className="size-5 object-contain" />
                  : <PackageSearch size={11} className="text-[var(--muted)]" aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text)]">
                {material.item?.name ?? material.prefabName}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-[var(--muted)]">
                {material.applied}/{material.required}
              </span>
              <span className="shrink-0 text-[11px] font-bold tabular-nums text-[var(--accent-text)]">
                −{material.missing}
              </span>
            </li>
          ))}
          {missing.length > VISIBLE_MATERIALS ? (
            <li className="pt-0.5 text-[10px] text-[var(--muted)]">
              {t('planner.overlay.more', { count: missing.length - VISIBLE_MATERIALS })}
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  )
}

/**
 * Deliberately small in-game companion: the active plan, its progress, and the
 * next few things to collect. The full planner stays in the desktop window.
 */
export function OverlayPlanWidget({ onOpenPlanner }: OverlayPlanWidgetProps) {
  const activePlan = useCraftingPlannerStore(selectActivePlan)

  // Plans are edited in the desktop window; both windows share the same storage.
  useEffect(() => {
    const rehydrate = () => void useCraftingPlannerStore.persist?.rehydrate()
    window.addEventListener('storage', rehydrate)
    window.addEventListener('focus', rehydrate)
    return () => {
      window.removeEventListener('storage', rehydrate)
      window.removeEventListener('focus', rehydrate)
    }
  }, [])

  if (!activePlan || activePlan.targets.length === 0) {
    return <EmptyBar onOpenPlanner={onOpenPlanner} />
  }
  return <OverlayPlanContent plan={activePlan} onOpenPlanner={onOpenPlanner} />
}
