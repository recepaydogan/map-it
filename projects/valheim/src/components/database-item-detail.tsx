import { Anvil, ChevronRight, ClipboardList, Coins, Hammer, Layers3, PackageOpen, Weight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatGameName } from '../lib/location-presentation'
import type { MarkerItemIntel } from '../types/marker-intelligence'
import { ItemAcquisitionSections, type ItemSourceViewProps } from './item-acquisition-sections'

interface DatabaseItemDetailProps extends ItemSourceViewProps {
  item: MarkerItemIntel
  items: Record<string, MarkerItemIntel>
  onSelectItem: (item: MarkerItemIntel) => void
  onAddToPlanner?: (prefabName: string) => void
}

const lookupItem = (items: Record<string, MarkerItemIntel>, prefabName: string) => (
  items[prefabName.toLowerCase()] ?? Object.values(items).find((item) => item.prefabName === prefabName)
)

export function DatabaseItemDetail({ item, items, onSelectItem, onAddToPlanner, ...sourceProps }: DatabaseItemDetailProps) {
  const { i18n, t } = useTranslation()
  const stationName = (prefab: string) => sourceProps.catalog?.graph.stations.get(prefab.toLowerCase())?.name
    ?? formatGameName(prefab.replace(/^piece_/, ''))
  const number = (value: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(value)
  const facts = [
    item.weight != null ? { icon: Weight, label: t('item.weight'), value: number(item.weight) } : null,
    item.maxStack != null ? { icon: Layers3, label: t('item.maxStack'), value: number(item.maxStack) } : null,
    item.value ? { icon: Coins, label: t('item.value'), value: number(item.value) } : null,
    item.maxQuality && item.maxQuality > 1 ? { icon: Anvil, label: t('item.maxQuality'), value: number(item.maxQuality) } : null,
  ].filter((fact): fact is NonNullable<typeof fact> => fact !== null)

  return (
    <article className="h-full overflow-y-auto">
      <header className="relative overflow-hidden border-b border-[var(--border)] px-8 py-6">
        <div className="relative flex items-center gap-5">
          <span className="grid size-20 shrink-0 place-items-center rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-black/30 shadow-inner"><img src={item.icon ?? ''} alt="" className="size-16 object-contain" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">{t(`item.types.${item.type}`, { defaultValue: item.type ?? t('database.item') })}</p>
            <h2 className="mt-1 font-[var(--font-display)] text-2xl font-semibold text-[var(--text)]">{item.name}</h2>
            {item.description || onAddToPlanner ? (
              <div className="mt-2 flex items-start justify-between gap-5">
                {item.description ? <p className="min-w-0 max-w-2xl flex-1 text-[13px] leading-5 text-[var(--muted)]">{item.description}</p> : <span />}
                {onAddToPlanner ? (
                  <button
                    type="button"
                    onClick={() => onAddToPlanner(item.prefabName)}
                    className="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                  >
                    <ClipboardList size={14} aria-hidden="true" />{t('planner.addToPlanner')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <div className="max-w-4xl space-y-5 px-8 py-6">
        {facts.length ? <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">{facts.map(({ icon: Icon, label, value }) => <div key={label} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"><dt className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]"><Icon size={12} />{label}</dt><dd className="mt-1 text-sm font-semibold text-[var(--text)]">{value}</dd></div>)}</dl> : null}

        {item.craftedBy?.length ? <section><h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]"><Hammer size={14} />{t('database.howToCraft')}</h3><div className="space-y-2">{item.craftedBy.map((recipe, index) => <div key={`${recipe.stationPrefab}:${index}`} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4"><div className="flex items-center justify-between"><strong className="text-xs text-[var(--text)]">{stationName(recipe.stationPrefab) || t('item.byHand')}</strong><span className="text-[10px] text-[var(--muted)]">{t('item.stationLevel', { level: recipe.stationLevel })} · ×{recipe.outputAmount}</span></div><div className="mt-3 flex flex-wrap gap-2">{recipe.resources.map((resource) => { const linked = lookupItem(items, resource.prefabName); return <button key={resource.prefabName} type="button" disabled={!linked} onClick={() => linked && onSelectItem(linked)} className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/25 px-2.5 py-1.5 text-[12px] text-[var(--text)] transition-colors hover:border-[var(--border-strong)] hover:bg-white/[0.04] disabled:cursor-default"><span className="grid size-6 shrink-0 place-items-center rounded bg-black/40"><img src={resource.icon ?? ''} alt="" className="size-5 object-contain" /></span><span className="font-medium">{resource.name}</span><span className="ml-1 rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[var(--accent-text)]">×{resource.amount}</span></button> })}</div></div>)}</div></section> : null}

        {item.usedInRecipes?.length ? <section><h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]"><PackageOpen size={14} />{t('database.usedToCraft', { count: item.usedInRecipes.length })}</h3><div className="grid gap-2 sm:grid-cols-2">{item.usedInRecipes.map((recipe) => { const linked = lookupItem(items, recipe.prefabName); return <button key={recipe.prefabName} type="button" disabled={!linked} onClick={() => linked && onSelectItem(linked)} className="group flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2.5 text-left hover:border-[var(--border-strong)] disabled:cursor-default"><span className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-black/25"><img src={recipe.icon ?? ''} alt="" className="size-8 object-contain" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-[var(--text)]">{recipe.name}</strong><span className="mt-0.5 block text-[10px] text-[var(--muted)]">{stationName(recipe.stationPrefab)} · {t('database.requiresAmount', { count: recipe.amount })}</span></span><ChevronRight size={14} className="text-[var(--muted)] group-hover:text-[var(--accent-text)]" /></button> })}</div></section> : null}

        <ItemAcquisitionSections key={item.prefabName} item={item} {...sourceProps} omitListedRecipes paginateResources />
      </div>
    </article>
  )
}
