import { Archive, Compass, PackageOpen, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMarkerIntelligence } from '../hooks/use-marker-intelligence'
import { cn } from '../lib/cn'
import type { RememberedContainer } from '../lib/live-tracking/container-types'
import type { ContainerItemPresentation } from './container-layer'
import { ItemDetailPanel } from './item-detail-panel'
import type { MarkerItemIntel } from '../types/marker-intelligence'

interface ContainerDetailPanelProps {
  container: RememberedContainer
  live: boolean
  containerName: (token: string, prefab: string) => string
  itemFor: (prefab: string) => ContainerItemPresentation | null
  leftOffset: number
  topOffset: number
  onClose: () => void
}

const formatDistance = (value: number) => (value >= 1_000
  ? `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)} km`
  : `${Math.round(value)} m`)

export function ContainerDetailPanel({
  container,
  live,
  containerName,
  itemFor,
  leftOffset,
  topOffset,
  onClose,
}: ContainerDetailPanelProps) {
  const { t, i18n } = useTranslation()
  const intelligence = useMarkerIntelligence()
  const [selectedItem, setSelectedItem] = useState<MarkerItemIntel | null>(null)
  const [itemHistory, setItemHistory] = useState<MarkerItemIntel[]>([])

  const title = containerName(container.name, container.prefab)

  // Merge item stacks by prefab
  const items = useMemo(() => {
    const merged = new Map<string, { prefab: string; amount: number; quality?: number }>()
    for (const item of container.items) {
      const key = item.prefab.toLowerCase()
      const row = merged.get(key)
      if (row) {
        row.amount += item.amount
      } else {
        merged.set(key, { prefab: item.prefab, amount: item.amount, quality: item.quality })
      }
    }
    return [...merged.values()].sort((a, b) => b.amount - a.amount)
  }, [container.items])

  const totalItemCount = useMemo(
    () => container.items.reduce((sum, item) => sum + item.amount, 0),
    [container.items],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (itemHistory.length > 0) {
        setSelectedItem(itemHistory[itemHistory.length - 1])
        setItemHistory((history) => history.slice(0, -1))
      } else if (selectedItem) {
        setSelectedItem(null)
      } else {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [itemHistory, onClose, selectedItem])

  const selectItemIntel = (prefab: string) => {
    if (selectedItem?.prefabName.toLowerCase() === prefab.toLowerCase()) {
      setSelectedItem(null)
      setItemHistory([])
      return
    }
    const intel = intelligence.catalog?.items[prefab.toLowerCase()]
    if (intel) {
      setItemHistory([])
      setSelectedItem(intel)
    }
  }

  const selectRelatedItem = (item: MarkerItemIntel) => {
    if (selectedItem) setItemHistory((history) => [...history, selectedItem])
    setSelectedItem(item)
  }

  const backFromItem = () => {
    if (itemHistory.length) {
      setSelectedItem(itemHistory[itemHistory.length - 1])
      setItemHistory((history) => history.slice(0, -1))
      return
    }
    setSelectedItem(null)
  }

  const closeCompanion = () => {
    setSelectedItem(null)
    setItemHistory([])
  }

  

  const worldFacts = [
    [t('map.coordinates'), `${container.x.toFixed(0)}, ${container.z.toFixed(0)}`],
    [t('map.altitude'), `${container.y.toFixed(0)} m`],
    [t('map.centerDistance'), formatDistance(Math.hypot(container.x, container.z))],
  ]

  return (
    <>
      {!selectedItem ? <aside
        className="pointer-events-auto absolute z-[25] flex w-[360px] max-w-[calc(100%-4rem)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-2xl shadow-black/60"
        style={{ left: leftOffset, top: topOffset, maxHeight: `calc(100% - ${topOffset + 8}px)` }}
        aria-label={t('map.detailsPanel')}
      >
        <header className="relative flex shrink-0 items-start gap-3 border-b border-[var(--border)] bg-[var(--surface)] p-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-[var(--radius-md)] border border-amber-400/30 bg-black/30 text-[var(--accent-text)]">
            <Archive size={27} strokeWidth={1.8} className="text-[var(--accent-text)]" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 pr-7">
            <h2 className="truncate text-base font-semibold leading-tight text-[var(--text)]">{title}</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{t('map.containers.title')}</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              <span className={cn('size-2 rounded-full', live ? (container.loaded ? 'bg-emerald-400' : 'bg-amber-400') : 'bg-zinc-500')} />
              <span>{!live ? t('map.containers.remembered') : container.loaded ? t('map.containers.live') : t('map.containers.lastSeen')}</span>
              <span className="text-[var(--border-strong)]">•</span>
              <span className="tabular-nums">{items.length} {t(items.length === 1 ? 'item.item' : 'item.items')} ({totalItemCount.toLocaleString(i18n.language)})</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 grid size-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            aria-label={t('common.close')}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <section className="px-4 py-3.5">
            <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              <Compass size={13} aria-hidden="true" />{t('map.worldLocation')}
            </h3>
            <dl className="grid grid-cols-3 gap-1.5">
              {worldFacts.map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-[var(--radius-sm)] bg-white/[0.035] px-2 py-2">
                  <dt className="truncate text-[9px] uppercase tracking-wide text-[var(--muted)]">{label}</dt>
                  <dd className="mt-0.5 truncate text-[11px] font-semibold tabular-nums text-[var(--text)]">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="border-t border-[var(--border)] px-4 py-3.5">
            <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              {t('item.contents')} ({items.length})
            </h3>

            {items.length === 0 ? (
              <div className="rounded-[var(--radius-sm)] bg-white/[0.035] p-6 text-center text-xs text-[var(--muted)]">
                <PackageOpen size={24} className="mx-auto mb-2 opacity-40" aria-hidden="true" />
                <p>{t('item.emptyContainer')}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {items.map(({ prefab, amount, quality }) => {
                  const presentation = itemFor(prefab)
                  const intel = intelligence.catalog?.items[prefab.toLowerCase()]
                  const hasIntel = Boolean(intel)
                  return (
                    <button
                      key={prefab}
                      type="button"
                      disabled={!hasIntel}
                      onClick={() => selectItemIntel(prefab)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] border px-2.5 py-2 text-left transition-all',
                        hasIntel
                          ? 'border-transparent bg-white/[0.035] cursor-pointer hover:border-[var(--border)] hover:bg-white/[0.06]'
                          : 'border-transparent bg-white/[0.035] cursor-default',
                      )}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/30">
                        {presentation?.icon ? (
                          <img src={presentation.icon} alt="" className="size-7 object-contain" />
                        ) : (
                          <PackageOpen size={16} className="text-[var(--muted)]" aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium text-[var(--text)]">
                          {presentation?.name ?? intel?.name ?? prefab}
                        </span>
                        {quality && quality > 1 ? (
                          <span className="text-[10px] text-[var(--muted)]">★ {quality}</span>
                        ) : null}
                      </div>
                      <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--accent-text)]">
                        ×{amount.toLocaleString(i18n.language)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </aside> : null}

      {selectedItem ? (
        <ItemDetailPanel
          backLabel={itemHistory[itemHistory.length - 1]?.name ?? title}
          item={selectedItem}
          items={intelligence.catalog?.items}
          leftOffset={leftOffset}
          topOffset={topOffset}
          onBack={backFromItem}
          onClose={closeCompanion}
          onSelectItem={selectRelatedItem}
        />
      ) : null}
    </>
  )
}
