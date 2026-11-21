import { ArrowLeft, PackageSearch, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { recipesFor } from '../../../lib/crafting/build-recipe-graph.ts'
import type { PlannerItemRef, RecipeGraph } from '../../../lib/crafting/recipe-types.ts'

type Scope = 'craftable' | 'pieces' | 'all'

const PAGE_SIZE = 96

interface CraftPickerProps {
  graph: RecipeGraph
  /** Set while swapping the item of an existing craft. */
  onBack: (() => void) | null
  onPick: (prefabName: string) => void
}

/**
 * The full-surface "what do you want to craft?" question. Same browsing model
 * as the Database: one search box, three scope chips, a clean item grid.
 */
export function CraftPicker({ graph, onBack, onPick }: CraftPickerProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const searchInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => searchInput.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [])

  const candidates = useMemo(() => {
    const items = [...graph.items.values()]
    return items.filter((item) => {
      const craftable = recipesFor(graph, item.prefabName).length > 0
      if (scope === 'craftable') return craftable
      if (scope === 'pieces') return item.isPiece
      return craftable || !item.isPiece
    })
  }, [graph, scope])

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const matched = normalized
      ? candidates.filter((item) =>
        item.name.toLowerCase().includes(normalized) ||
        item.prefabName.toLowerCase().includes(normalized))
      : candidates
    return [...matched]
      .sort((first, second) => first.name.localeCompare(second.name))
  }, [candidates, query])

  const pick = (item: PlannerItemRef) => onPick(item.prefabName)

  return (
    <div className="flex h-full min-h-0 flex-col items-start overflow-y-auto">
      <div className="flex w-full max-w-[760px] shrink-0 flex-col items-start px-8 pt-8 pb-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="mb-3.5 flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-black/25 px-2.5 text-[11px] font-semibold text-[var(--text)] transition-colors hover:border-[var(--border-strong)] hover:bg-white/[0.04]"
          >
            <ArrowLeft size={12} aria-hidden="true" />{t('common.back', { defaultValue: 'Back' })}
          </button>
        ) : null}
        <h1 className="text-left text-[20px] font-bold tracking-tight text-[var(--text)]">
          {t('planner.craft.pickerTitle')}
        </h1>
        <p className="mt-1 text-left text-[12px] text-[var(--muted)]">
          {t('planner.craft.pickerSubtitle')}
        </p>

        <div className="mt-4 flex w-full flex-wrap items-center gap-2">
          <label className="flex h-8 w-60 items-center gap-2 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-black/25 px-2.5 transition-colors focus-within:border-[var(--accent)]">
            <Search size={14} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
            <span className="sr-only">{t('planner.craft.search')}</span>
            <input
              ref={searchInput}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setVisibleCount(PAGE_SIZE)
              }}
              placeholder={t('planner.craft.search')}
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
            />
          </label>

          <div className="flex items-center gap-1.5" role="tablist" aria-label={t('planner.addTarget.scope')}>
            {(['craftable', 'pieces', 'all'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={scope === value}
                onClick={() => {
                  setScope(value)
                  setVisibleCount(PAGE_SIZE)
                }}
                className={cn(
                  'flex h-8 cursor-pointer items-center overflow-hidden rounded-[var(--radius-md)] border px-3 text-[11px] font-semibold transition-colors',
                  scope === value
                    ? 'border-[var(--accent)] bg-black/25 text-[var(--accent-text)]'
                    : 'border-[var(--border)] bg-black/25 text-[var(--muted)] hover:border-[var(--border-strong)] hover:bg-white/[0.04] hover:text-[var(--text)]',
                )}
              >
                {t(`planner.addTarget.scopes.${value}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 w-full max-w-[760px] flex-1 px-8 pb-10">
        {results.length === 0 ? (
          <p className="px-3 py-10 text-left text-[12px] text-[var(--muted)]">
            {t('planner.addTarget.noResults')}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {results.slice(0, visibleCount).map((item) => (
              <li key={item.prefabName}>
                <button
                  type="button"
                  onClick={() => pick(item)}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border border-transparent px-2.5 py-2 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-white/[0.04]"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/25">
                    {item.icon
                      ? <img src={item.icon} alt="" className="size-7 object-contain" />
                      : <PackageSearch size={14} className="text-[var(--muted)]" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-[var(--text)]">{item.name}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-[var(--muted)]">
                      {item.isPiece
                        ? t('planner.addTarget.buildPiece')
                        : t(`item.types.${item.type}`, { defaultValue: item.type })}
                      {item.maxQuality > 1 ? ` · ${t('item.maxQuality')} ${item.maxQuality}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {results.length > visibleCount ? (
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            className="mt-3 cursor-pointer rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
          >
            {t('planner.craft.showMore', {
              defaultValue: 'Show more · {{shown}}/{{total}}',
              shown: Math.min(visibleCount, results.length),
              total: results.length,
            })}
          </button>
        ) : null}
      </div>
    </div>
  )
}
