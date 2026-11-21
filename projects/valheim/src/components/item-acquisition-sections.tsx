import { ArrowUpRight, Coins, Hammer, LockKeyhole, PackageOpen, Skull, Sprout, Store } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { itemAcquisitionSources, itemSourceMapCount, type ItemAcquisitionCatalog, type ItemAcquisitionSource } from '../lib/item-acquisition'
import { formatLocationName, locationNameLabelKey } from '../lib/location-presentation'
import { resourceSourceLabel } from '../lib/valheim/resource-source-label'
import { useGameLocalization } from '../hooks/use-localization-table'
import type { ResourceStateIndex } from '../lib/valheim/resource-state'
import type { MarkerItemIntel } from '../types/marker-intelligence'

export interface ItemSourceViewProps {
  catalog: ItemAcquisitionCatalog | null
  sourceError?: boolean
  mapLoading?: boolean
  markerCounts?: Map<string, number>
  resourceIndex?: ResourceStateIndex | null
  onShowSource?: (item: MarkerItemIntel, source: ItemAcquisitionSource) => void
}

const bossKeys: Record<string, string> = {
  defeated_eikthyr: 'eikthyr', defeated_gdking: 'theElder', defeated_bonemass: 'bonemass',
  defeated_dragon: 'moder', defeated_goblinking: 'yagluth', defeated_queen: 'theQueen',
  defeated_fader: 'fader', defeated_frozenking_p3: 'frozenKing', defeated_writhan: 'writhan', defeated_serpent: 'serpent',
}

export function ItemAcquisitionSections({ item, catalog, sourceError, mapLoading, markerCounts, resourceIndex, onShowSource, omitListedRecipes, paginateResources, mapOnly }: ItemSourceViewProps & { item: MarkerItemIntel; omitListedRecipes?: boolean; paginateResources?: boolean; mapOnly?: boolean }) {
  const { t, i18n } = useTranslation()
  const gameLocalization = useGameLocalization()
  const [limits, setLimits] = useState<Record<string, number>>({})
  const listId = useId()
  const sources = useMemo(() => catalog ? itemAcquisitionSources(item, catalog)
    .filter((source) => (!omitListedRecipes || !item.craftedBy?.some((recipe) => recipe.recipeId === source.id))
      && (!mapOnly || itemSourceMapCount(item, source, markerCounts, resourceIndex) > 0)) : [],
  [item, catalog, omitListedRecipes, mapOnly, markerCounts, resourceIndex])
  const groups = [...new Set(sources.map((source) => source.kind))]
  const number = (value: number) => value.toLocaleString(i18n.language, { maximumFractionDigits: 1 })
  if (!catalog) return <p className="py-3 text-xs text-[var(--muted)]" role="status">{t(sourceError ? 'itemSources.loadError' : 'common.loading')}</p>
  if (!sources.length) return mapOnly
    ? <p className="py-3 text-xs text-[var(--muted)]" role="status">{t(mapLoading ? 'itemSources.findingSpots' : 'itemSources.noMapSources')}</p>
    : omitListedRecipes && item.craftedBy?.length ? null : <p className="py-3 text-xs text-[var(--muted)]">{t('itemSources.unknown')}</p>

  return <div className="space-y-6">
    {groups.map((kind) => {
      const entries = sources.filter((source) => source.kind === kind)
      const visibleCount = paginateResources && ['locationDestructible', 'resource', 'locationPickable', 'locationLoot'].includes(kind)
        ? limits[kind] ?? 4 : entries.length
      const Icon = kind === 'trader' ? Store : kind === 'creature' || kind === 'boss' ? Skull
        : kind === 'locationPickable' ? Sprout : ['craft', 'conversion', 'build'].includes(kind) ? Hammer : PackageOpen
      return <section key={kind}>
        <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          <Icon size={12} strokeWidth={1.5} aria-hidden="true" />{t(`itemSources.kinds.${kind}`)}
          <span className="h-px flex-1 bg-[var(--border)]" aria-hidden="true" />
          <span className="text-[11px] tabular-nums tracking-normal">{entries.length}</span>
        </h3>
        <div id={`${listId}-${kind}`} className="@container divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
          {entries.slice(0, visibleCount).map((source) => {
            const isPlace = source.kind.startsWith('location')
            const isRecipe = ['craft', 'conversion', 'build'].includes(source.kind)
            const label = isPlace
              ? t(locationNameLabelKey(source.prefabName), { defaultValue: formatLocationName(source.prefabName) })
              : source.kind === 'resource' ? resourceSourceLabel(source.resourceKind, item.name, t)
                : source.name || t(source.kind === 'fishing' ? 'planner.sources.fishingTitle' : 'item.byHand')
            const count = itemSourceMapCount(item, source, markerCounts, resourceIndex)
            const boss = source.requiredGlobalKey ? bossKeys[source.requiredGlobalKey] : null
            const facts = [
              source.amountMin !== undefined && source.amountMax !== undefined ? `${t('itemSources.amount', { amount: source.amountMin === source.amountMax ? source.amountMin : `${source.amountMin}–${source.amountMax}` })}${source.onePerPlayer ? ` · ${t('map.onePerPlayer')}` : ''}` : null,
              !mapOnly && (source.minToolTier ?? 0) > 0 ? t('itemSources.toolTier', { tier: source.minToolTier }) : null,
              (source.respawnTimeMinutes ?? 0) > 0 ? t('itemSources.respawn', { minutes: source.respawnTimeMinutes }) : null,
              source.outputAmount !== undefined ? t('itemSources.yields', { count: source.outputAmount }) : null,
              !mapOnly && source.kind === 'resource' ? t(source.resourceKind === 'tree' || source.resourceKind === 'tree-log' ? 'itemSources.chopSource' : source.resourceKind === 'pickable' ? 'itemSources.gatherSource' : 'itemSources.breakSource') : null,
            ].filter((fact): fact is string => fact !== null)
            if (mapOnly) return <div key={source.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-bold leading-5 text-[var(--text)]">{label}</p>
                {source.kind === 'trader' ? <p className="mt-1 flex items-center gap-1 text-[10px] leading-4 text-[var(--muted)]">
                  {source.requiredGlobalKey ? <LockKeyhole size={10} aria-hidden="true" /> : null}
                  {source.requiredGlobalKey ? boss ? t('map.unlockAfterBoss', { boss: t(`map.progression.${boss}`) }) : t('map.requiresProgression') : t('map.availableImmediately')}
                  {(source.stack ?? 1) > 1 ? ` · ×${source.stack}` : ''}
                </p> : null}
                {source.biomes?.length || facts.length || source.price !== undefined || (source.chance !== undefined && !isPlace) ? <ul className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] leading-4 text-[var(--muted)]">
                  {source.biomes?.length ? <li><span className="sr-only">{t('itemSources.foundInLabel')} </span>{source.biomes.map((biome) => gameLocalization?.translateText(biome) ?? biome).join(' · ')}</li> : null}
                  {facts.map((fact, index) => <li key={index}>{fact}</li>)}
                  {source.price !== undefined ? <li className="flex items-center gap-1 font-semibold tabular-nums text-[var(--accent-text)]"><Coins size={11} aria-hidden="true" />{number(source.price)}</li>
                    : source.chance !== undefined && !isPlace ? <li className="tabular-nums">{number(source.chance * 100)}%</li> : null}
                </ul> : null}
              </div>
              {onShowSource && count > 0 ? <button type="button" title={t('itemSources.mapAction')} aria-label={`${t('itemSources.mapAction')} · ${t('itemSources.mapSpots', { count })}`} onClick={() => onShowSource(item, source)} className="flex min-h-7 cursor-pointer items-center gap-1.5 self-center rounded-[var(--radius-sm)] px-1 text-[11px] font-medium tabular-nums text-[var(--text)] hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-[var(--accent)]">
                {t('itemSources.mapSpots', { count })}<ArrowUpRight size={13} strokeWidth={1.5} className="text-[var(--muted)]" aria-hidden="true" />
              </button> : null}
            </div>
            const metadata = [
              ...(source.biomes?.length ? [source.biomes.map((biome) => gameLocalization?.translateText(biome) ?? biome).join(' · ')] : []),
              ...facts,
              source.chance !== undefined && !isPlace && !isRecipe ? `${number(source.chance * 100)}%` : null,
            ].filter((fact): fact is string => fact !== null)
            return <div key={source.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 px-3 py-3">
              <div className="min-w-0">
                <p className="text-xs font-bold leading-5 text-[var(--text)]">{label}</p>
                {metadata.length ? <p title={metadata.join(' · ')} className="mt-1 overflow-x-auto whitespace-nowrap text-[10px] leading-4 text-[var(--muted)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{metadata.join(' · ')}</p> : null}
                {source.kind === 'trader' ? <p className="mt-1 flex items-start gap-1 text-[10px] leading-4 text-[var(--muted)]">
                  {source.requiredGlobalKey ? <LockKeyhole size={11} className="mt-0.5 shrink-0" aria-hidden="true" /> : null}
                  {source.requiredGlobalKey ? boss ? t('map.unlockAfterBoss', { boss: t(`map.progression.${boss}`) }) : t('map.requiresProgression') : t('map.availableImmediately')}
                  {(source.stack ?? 1) > 1 ? ` · ×${source.stack}` : ''}
                </p> : null}
                {source.price !== undefined ? <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold tabular-nums text-[var(--accent-text)]"><Coins size={12} aria-hidden="true" />{number(source.price)}</p> : null}
                {source.inputSummary?.length ? <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{source.inputSummary.map((input) => `${catalog.graph.items.get(input.prefabName.toLowerCase())?.name ?? input.prefabName} ×${input.amount}`).join(' · ')}</p> : null}
              </div>
              {onShowSource && !isRecipe && source.kind !== 'fishing' ? count > 0 ? <button type="button" aria-label={t('itemSources.showOnMap', { count })} onClick={() => onShowSource(item, source)} className="group/map flex min-h-11 cursor-pointer items-center justify-self-end gap-1.5 self-center rounded-[var(--radius-sm)] px-1 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-[var(--accent)]">
                <span><span className="block whitespace-nowrap text-[11px] font-medium leading-5 text-[var(--text)]">{t('itemSources.mapAction')}</span><span className="block text-[10px] leading-4 tabular-nums text-[var(--muted)]">{t('itemSources.mapSpots', { count })}</span></span>
                <ArrowUpRight size={13} strokeWidth={1.5} className="shrink-0 text-[var(--muted)] transition-colors group-hover/map:text-[var(--accent-text)]" aria-hidden="true" />
              </button>
                : !mapLoading && (source.biomes?.length || source.kind === 'resource') ? null : <p className="col-span-2 mt-2 text-[10px] text-[var(--muted)]">{t(mapLoading ? 'itemSources.findingSpots' : source.locationIds.length ? 'itemSources.noSpot' : 'itemSources.noLocationLink')}</p> : null}
            </div>
          })}
        </div>
        {entries.length > visibleCount ? <button
          type="button"
          aria-controls={`${listId}-${kind}`}
          aria-label={t('itemSources.showMoreIn', { kind: t(`itemSources.kinds.${kind}`), count: Math.min(4, entries.length - visibleCount) })}
          onClick={() => setLimits((current) => ({ ...current, [kind]: visibleCount + 4 }))}
          className="mt-1 min-h-10 w-full cursor-pointer rounded-[var(--radius-sm)] px-3 text-xs font-medium text-[var(--text)] transition-colors hover:bg-white/[0.03] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-[var(--accent)]"
        >{t('itemSources.showMore', { count: Math.min(4, entries.length - visibleCount) })}</button> : null}
      </section>
    })}
  </div>
}
