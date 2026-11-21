import {
  Activity,
  Anvil,
  ChevronDown,
  ChevronRight,
  Hammer,
  PackageSearch,
  Skull,
} from 'lucide-react'
import { useContext, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { formatGameName } from '../lib/location-presentation'
import type { MarkerItemIntel, MarkerItemRecipeIntel } from '../types/marker-intelligence'
import { ItemSourceContext } from './item-source-context'
import { ItemAcquisitionSections } from './item-acquisition-sections'

interface ItemDetailContextSectionsProps {
  item: MarkerItemIntel
  items?: Record<string, MarkerItemIntel>
  onSelectItem?: (item: MarkerItemIntel) => void
}

const amountLabel = (minimum: number, maximum: number) => (
  minimum === maximum ? `×${minimum}` : `×${minimum}–${maximum}`
)

const greatestCommonDivisor = (left: number, right: number): number => {
  let first = Math.abs(Math.round(left))
  let second = Math.abs(Math.round(right))
  while (second) [first, second] = [second, first % second]
  return first || 1
}

const recipeRatioKey = (recipe: MarkerItemRecipeIntel) => {
  const resources = recipe.resources
    .map((resource) => {
      const divisor = greatestCommonDivisor(resource.amount, recipe.outputAmount)
      return `${resource.prefabName.toLowerCase()}:${resource.amount / divisor}/${recipe.outputAmount / divisor}`
    })
    .sort()
    .join('|')
  return `${recipe.stationPrefab.toLowerCase()}:${recipe.stationLevel}:${resources}`
}

const compactScaledRecipes = (recipes: MarkerItemRecipeIntel[]) => {
  const seen = new Set<string>()
  return [...recipes]
    .sort((left, right) => left.outputAmount - right.outputAmount)
    .filter((recipe) => {
      const key = recipeRatioKey(recipe)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function ItemDetailContextSections({ item, items, onSelectItem }: ItemDetailContextSectionsProps) {
  const { t } = useTranslation()
  const sourceView = useContext(ItemSourceContext)
  const stationName = (prefabName: string) => sourceView?.catalog?.graph.stations.get(prefabName.toLowerCase())?.name
    ?? formatGameName(prefabName.replace(/^piece_/, ''))
  const [expandedRecipeItem, setExpandedRecipeItem] = useState<string | null>(null)
  const recipeListId = useId()
  const craftingRecipes = compactScaledRecipes(item.craftedBy ?? [])
  const usedInRecipes = item.usedInRecipes ?? []
  const showAllRecipes = expandedRecipeItem === item.prefabName
  const visibleRecipeUses = showAllRecipes ? usedInRecipes : usedInRecipes.slice(0, 4)
  const uses = [
    item.forsakenPowerBoss ? {
      title: t('item.forsakenPowerUseTitle'),
      description: t('item.forsakenPowerUse', { boss: item.forsakenPowerBoss }),
    } : null,
    item.bossOfferingUse ? {
      title: t('item.bossOfferingUseTitle'),
      description: t('item.bossOfferingUse', item.bossOfferingUse),
    } : null,
    item.specialUse ? {
      title: t('item.specialUseTitle'),
      description: t(`item.specialUses.${item.specialUse}`),
    } : null,
    item.equipEffect ? {
      title: item.equipEffect.name,
      description: item.equipEffect.description,
    } : null,
    item.setEffect ? {
      title: item.setEffect.name,
      description: item.setSize
        ? t('item.setEffectDescription', { count: item.setSize, effect: item.setEffect.description })
        : item.setEffect.description,
    } : null,
  ].filter((use): use is NonNullable<typeof use> => use !== null)

  return (
    <>
      {uses.length ? (
        <section className="mt-5">
          <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            <Activity size={13} aria-hidden="true" />{t('item.gameplayUse')}
          </h3>
          <div className="space-y-1.5">
            {uses.map((use) => (
              <div key={`${use.title}:${use.description}`} className="rounded-[var(--radius-sm)] border border-[var(--accent)]/15 bg-[var(--accent)]/[0.055] px-3 py-2.5">
                <p className="text-[12px] font-semibold text-[var(--text)]">{use.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">{use.description}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {sourceView ? <div className="mt-5"><ItemAcquisitionSections item={item} {...sourceView} omitListedRecipes /></div> : item.dropSources?.length ? (
        <section className="mt-5">
          <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            <Skull size={13} aria-hidden="true" />{t('item.droppedBy')}
          </h3>
          <div className="space-y-1.5">
            {item.dropSources.map((source) => (
              <div key={source.prefabName} className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-white/[0.04] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-[var(--text)]">{source.name}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                    {source.chance === 1
                      ? t('map.guaranteedDrop')
                      : t('map.dropChance', { chance: Math.round(source.chance * 100) })}
                    {source.onePerPlayer ? ` · ${t('map.onePerPlayer')}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[var(--accent-text)]">
                  {amountLabel(source.amountMin, source.amountMax)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {craftingRecipes.length ? (
        <section className="mt-5">
          <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            <Hammer size={13} aria-hidden="true" />{t('item.crafting')}
          </h3>
          <div className="space-y-2">
            {craftingRecipes.map((recipe, recipeIndex) => (
              <div key={`${recipe.stationPrefab}:${recipeIndex}`} className="rounded-[var(--radius-sm)] bg-white/[0.04] p-3">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-[var(--text)]">
                    {recipe.stationPrefab ? stationName(recipe.stationPrefab) : t('item.byHand')}
                  </span>
                  <span className="text-[var(--muted)]">
                    {t('item.stationLevel', { level: recipe.stationLevel })} · ×{recipe.outputAmount}
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {recipe.resources.map((resource) => {
                    const relatedItem = items?.[resource.prefabName.toLowerCase()]
                    const selectRelated = relatedItem && onSelectItem
                      ? () => onSelectItem(relatedItem)
                      : undefined
                    const clickable = Boolean(selectRelated)
                    const Component = clickable ? 'button' : 'div'
                    return (
                      <Component
                        key={resource.prefabName}
                        type={clickable ? 'button' : undefined}
                        onClick={selectRelated}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/25 px-2.5 py-1.5 text-left transition-colors',
                          clickable
                            ? 'cursor-pointer hover:border-[var(--border-strong)] hover:bg-white/[0.04]'
                            : 'cursor-default',
                        )}
                      >
                        <span className="grid size-6 shrink-0 place-items-center rounded bg-black/40">
                          {resource.icon ? (
                            <img src={resource.icon} alt="" className="size-5 object-contain" />
                          ) : null}
                        </span>
                        <span className="text-[12px] font-medium text-[var(--text)]">{resource.name}</span>
                        <span className="ml-1 rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[var(--accent-text)]">
                          ×{resource.amount}
                        </span>
                      </Component>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {usedInRecipes.length ? (
        <section className="mt-5">
          <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            <Anvil size={13} aria-hidden="true" />{t('item.usedInRecipes', { count: usedInRecipes.length })}
          </h3>
          <div id={recipeListId} className="space-y-1.5">
            {visibleRecipeUses.map((usage) => {
              const relatedItem = items?.[usage.prefabName.toLowerCase()]
              const selectRelated = relatedItem && onSelectItem
                ? () => onSelectItem(relatedItem)
                : undefined
              const clickable = Boolean(selectRelated)
              const Component = clickable ? 'button' : 'div'
              return (
              <Component
                key={`${usage.prefabName}:${usage.stationPrefab}`}
                type={clickable ? 'button' : undefined}
                onClick={selectRelated}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] border px-2.5 py-2 text-left transition-colors',
                  clickable
                    ? 'cursor-pointer border-transparent bg-white/[0.04] hover:border-[var(--accent)]/30 hover:bg-white/[0.07]'
                    : 'border-transparent bg-white/[0.04]',
                )}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-black/20">
                  {usage.icon ? <img src={usage.icon} alt="" className="size-7 object-contain" /> : <PackageSearch size={14} aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-[var(--text)]">{usage.name}</p>
                  <p className="mt-0.5 truncate text-[9px] text-[var(--muted)]">
                    {usage.stationPrefab ? stationName(usage.stationPrefab) : t('item.byHand')}
                  </p>
                </div>
                <span className="text-[10px] tabular-nums text-[var(--accent-text)]">×{usage.amount}</span>
                {clickable ? <ChevronRight size={14} className="shrink-0 text-[var(--muted)]" aria-hidden="true" /> : null}
              </Component>
              )
            })}
          </div>
          {usedInRecipes.length > 4 ? (
            <button
              type="button"
              onClick={() => setExpandedRecipeItem(showAllRecipes ? null : item.prefabName)}
              aria-expanded={showAllRecipes}
              aria-controls={recipeListId}
              className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1 rounded-[var(--radius-sm)] py-1.5 text-[10px] font-medium text-[var(--muted)] transition-colors hover:bg-white/[0.04] hover:text-[var(--text)]"
            >
              {showAllRecipes
                ? t('item.showLessRecipes')
                : t('item.showMoreRecipes', { count: usedInRecipes.length - 4 })}
              <ChevronDown
                size={12}
                className={cn('transition-transform', showAllRecipes && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
          ) : null}
        </section>
      ) : null}
    </>
  )
}
