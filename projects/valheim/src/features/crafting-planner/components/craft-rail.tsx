import { Hammer, Plus, Search, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import type { PlannerItemRef } from '../../../lib/crafting/recipe-types.ts'
import type { CraftingPlan } from '../../../store/crafting-planner-store.ts'

export interface CraftRailEntry {
  plan: CraftingPlan
  /** The crafted item, when the craft has one picked. */
  item: PlannerItemRef | null
  completion: number
}

interface CraftRailProps {
  entries: CraftRailEntry[]
  activePlanId: string | null
  onSelect: (planId: string) => void
  onCreate: () => void
}

/**
 * The left-hand list of crafts. One craft is one item; the entry is named by
 * that item, so the rail reads like a build queue instead of a document list.
 */
export function CraftRail({ entries, activePlanId, onSelect, onCreate }: CraftRailProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const search = query.trim().toLocaleLowerCase()
  const filteredEntries = entries.filter(({ plan, item }) =>
    [item?.name, item?.prefabName, plan.name, !item ? t('planner.craft.emptyName') : '']
      .some((value) => value?.toLocaleLowerCase().includes(search)))
  const create = () => {
    setQuery('')
    onCreate()
  }

  return (
    <aside className="flex w-[218px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]/45">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          {t('planner.craft.listTitle')}
        </h2>
        <button
          type="button"
          onClick={create}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2.5 text-[10.5px] font-bold text-[var(--text)] hover:bg-[var(--surface-hover)]"
        >
          <Plus size={12} aria-hidden="true" />{t('planner.plan.new')}
        </button>
      </header>

      <label className="mx-3 mt-3 flex h-8 shrink-0 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-black/25 px-2 focus-within:border-[var(--accent)]">
        <Search size={13} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t('planner.craft.searchCrafts')} placeholder={t('planner.craft.searchCrafts')} className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--text)] outline-none placeholder:text-[var(--muted)]" />
        {query && <button type="button" onClick={() => setQuery('')} aria-label={t('planner.craft.clearSearch')} className="grid size-5 shrink-0 cursor-pointer place-items-center text-[var(--muted)] hover:text-[var(--text)]"><X size={12} aria-hidden="true" /></button>}
      </label>

      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        <li className="mb-1">
          <button type="button" onClick={create} className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-2 text-left text-[12px] font-semibold text-[var(--accent-text)] hover:bg-white/[0.05]">
            <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-raised)]"><Plus size={15} aria-hidden="true" /></span>
            {t('planner.plan.new')}
          </button>
        </li>
        {search && filteredEntries.length === 0 && <li className="px-2 py-3 text-[11px] text-[var(--muted)]">{t('planner.craft.noMatchingCrafts')}</li>}
        {filteredEntries.map(({ plan, item }) => {
          const active = plan.id === activePlanId
          const name = item?.name ?? t('planner.craft.emptyName')
          return (
            <li key={plan.id} className="flex items-center">
              <button
                type="button"
                onClick={() => onSelect(plan.id)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-2 text-left transition-all',
                  active ? 'shadow-[inset_2px_0_var(--accent)] text-[var(--text)]' : 'hover:bg-white/[0.05]',
                )}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/25">
                  {item?.icon
                    ? <img src={item.icon} alt="" className="size-7 object-contain" />
                    : <Hammer size={14} className="text-[var(--muted)]" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1 pr-1">
                  <span className={cn(
                    'block truncate text-[12px] font-semibold',
                    item ? 'text-[var(--text)]' : 'text-[var(--muted)]',
                  )}>
                    {name}
                  </span>
                  {item && plan.targets[0] && plan.targets[0].quantity > 1 ? (
                    <span className="mt-0.5 block text-[10px] tabular-nums text-[var(--muted)]">
                      ×{plan.targets[0].quantity}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
