import {
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  Hammer,
  MapPin,
  Minus,
  PackageSearch,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import type {
  PlanCalculation,
  PlanTarget,
  PlanTargetResult,
  RecipeGraph,
} from '../../../lib/crafting/recipe-types.ts'
import { MAX_TARGET_QUANTITY } from '../../../lib/crafting/recipe-types.ts'
import type { InventoryStatus } from '../../../lib/live-tracking/inventory-types.ts'
import type { ContainerHolding } from '../../../lib/live-tracking/container-payload.ts'
import { formatLocationName, locationNameLabelKey } from '../../../lib/location-presentation'
import type { MaterialPresentation } from '../planner-types.ts'
import { formatDistanceParts, type MaterialHint } from '../resource-hints.ts'
import { actionForNodeKind, nodeDisplayName } from '../source-context.ts'
import { InventoryStatusChip, type InventoryStatusActions } from './inventory-status.tsx'
import { ProgressRing } from './progress-ring.tsx'

interface CraftHeroProps {
  planId: string
  graph: RecipeGraph
  target: PlanTarget
  result: PlanTargetResult | null
  calculation: PlanCalculation
  materials: MaterialPresentation[]
  intermediates: MaterialPresentation[]
  manualDisabled: boolean
  inventoryStatus: InventoryStatus
  inventoryUpdatedAt: number | null
  inventoryError: string | null
  inventoryScope: { characterName: string; worldName: string } | null
  inventoryActions: InventoryStatusActions
  hintFor: (prefabName: string) => MaterialHint
  /** Chests holding a material, nearest first; empty when none is known. */
  holdingsFor: (prefabName: string) => ContainerHolding[]
  onGoToContainers: (prefabName: string) => void
  hasWorldData: boolean
  onRefreshWorldData: () => void
  onQuantityChange: (quantity: number) => void
  onQualityChange: (quality: number) => void
  onChangeItem: () => void
  onDelete?: () => void
  onManualAmountChange: (prefabName: string, amount: number) => void
  onGo: (prefabName: string, hint: MaterialHint) => void
}

const hintTone: Record<MaterialHint['kind'], string> = {
  confirmed: 'text-emerald-300',
  respawning: 'text-amber-200',
  location: 'text-sky-300',
  creature: 'text-[var(--muted)]',
  boss: 'text-[var(--muted)]',
  trader: 'text-[var(--muted)]',
  fishing: 'text-[var(--muted)]',
  craftOnly: 'text-[var(--muted)]',
  unknown: 'text-[var(--muted)]',
}

function MaterialRow({
  graph,
  material,
  manualDisabled,
  hint,
  holdings,
  onManualAmountChange,
  onGo,
  onGoToContainers,
}: {
  graph: RecipeGraph
  material: MaterialPresentation
  manualDisabled: boolean
  hint: MaterialHint
  holdings: ContainerHolding[]
  onManualAmountChange: (prefabName: string, amount: number) => void
  onGo: (prefabName: string, hint: MaterialHint) => void
  onGoToContainers: (prefabName: string) => void
}) {
  const { t } = useTranslation()
  const done = material.missing <= 0
  const have = Math.min(material.required, material.reserved)

  const hasContainers = holdings.length > 0
  const mappableHint = !done && (
    hint.kind === 'confirmed' ||
    hint.kind === 'respawning' ||
    hint.kind === 'location' ||
    (hint.kind === 'creature' && hint.mappable) ||
    (hint.kind === 'boss' && hint.mappable)
  )

  const totalInChests = holdings.reduce((sum, holding) => sum + holding.amount, 0)
  const nearestChest = holdings[0]
  const chestDistance = nearestChest ? formatDistanceParts(nearestChest.distance) : null
  const chestLabel = nearestChest
    ? `${totalInChests} in chest${chestDistance ? ` · ${t(`planner.craft.distance.${chestDistance.key}`, { count: chestDistance.count })}` : ''}`
    : null

  const worldHintLabel = (() => {
    switch (hint.kind) {
      case 'confirmed': {
        const distance = formatDistanceParts(hint.distance)
        const node = graph.resourceNodes[hint.nodePrefab.toLowerCase()]
        const action = t(`planner.mapMode.action.${actionForNodeKind(node?.kind ?? 'pickable')}`, {
          subject: nodeDisplayName(hint.nodePrefab),
          tool: '',
        }).trim()
        return `${action} · ${t('planner.craft.nearest.confirmed', {
          distance: t(`planner.craft.distance.${distance.key}`, { count: distance.count }),
          direction: t(`planner.craft.direction.${hint.direction}`),
        })}`
      }
      case 'respawning':
        return t('planner.craft.nearest.respawning', { minutes: hint.minutes })
      case 'location':
        return t('planner.craft.nearest.location', {
          name: t(locationNameLabelKey(hint.locationPrefab), {
            defaultValue: formatLocationName(hint.locationPrefab),
          }),
        })
      case 'creature':
        return t('planner.craft.nearest.creature', { name: hint.name })
      case 'boss':
        return t('planner.craft.nearest.boss', { name: hint.name })
      case 'trader':
        return t('planner.craft.nearest.trader', { name: hint.name })
      case 'fishing':
        return t('planner.craft.nearest.fishing')
      case 'craftOnly':
        return null
      default:
        return t('planner.craft.nearest.unknown')
    }
  })()

  return (
    <li className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 transition-colors hover:border-[var(--border-strong)]">
      {/* Left: Icon + Info (Name & inline source chips) */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/30">
          {material.item?.icon
            ? <img src={material.item.icon} alt="" className="size-7 object-contain" />
            : <PackageSearch size={15} className="text-[var(--muted)]" aria-hidden="true" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-[var(--text)]">
              {material.item?.name ?? material.prefabName}
            </span>
            {done ? <Check size={13} className="shrink-0 text-emerald-400" aria-hidden="true" /> : null}
          </div>

          {/* Inline source chips */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {hasContainers && chestLabel ? (
              <button
                type="button"
                onClick={() => onGoToContainers(material.prefabName)}
                title={t('planner.craft.locateChest', { defaultValue: 'Locate Chest' })}
                className="group/chip inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/25 px-1.5 py-0.5 text-[10.5px] font-medium text-sky-300 transition-colors hover:border-[var(--border-strong)] hover:bg-white/[0.04]"
              >
                <Archive size={11} className="shrink-0 text-sky-300" aria-hidden="true" />
                <span className="truncate">{chestLabel}</span>
                <ChevronRight size={10} className="shrink-0 text-sky-300/60 transition-transform group-hover/chip:translate-x-0.5 group-hover/chip:text-sky-300" aria-hidden="true" />
              </button>
            ) : null}

            {!done && worldHintLabel ? (
              <button
                type="button"
                onClick={mappableHint ? () => onGo(material.prefabName, hint) : undefined}
                disabled={!mappableHint}
                title={mappableHint ? t('planner.craft.viewOnMap', { defaultValue: 'View on Map' }) : undefined}
                className={cn(
                  'group/chip inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/25 px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--muted)] transition-colors',
                  mappableHint
                    ? 'cursor-pointer hover:border-[var(--border-strong)] hover:bg-white/[0.04] hover:text-[var(--text)]'
                    : 'cursor-default',
                )}
              >
                <MapPin size={11} className={cn('shrink-0', hintTone[hint.kind])} aria-hidden="true" />
                <span className="truncate">{worldHintLabel}</span>
                {mappableHint ? (
                  <ChevronRight size={10} className="shrink-0 text-[var(--muted)]/60 transition-transform group-hover/chip:translate-x-0.5 group-hover/chip:text-[var(--text)]" aria-hidden="true" />
                ) : null}
              </button>
            ) : null}

            {done && !hasContainers ? (
              <span className="text-[10.5px] font-medium text-emerald-400/80">
                {t('planner.craft.ready', { defaultValue: 'In inventory' })}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Right: Quantity / Manual input */}
      <div className="flex shrink-0 items-center gap-2">
        {manualDisabled ? (
          <span className="text-xs font-bold tabular-nums">
            <span className={done ? 'text-emerald-400' : 'text-[var(--text)]'}>{have}</span>
            <span className="font-normal text-[var(--muted)]"> / {material.required}</span>
          </span>
        ) : (
          <div className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/25 px-1.5 py-0.5 focus-within:border-[var(--accent)]">
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={material.ownedTotal > 0 ? material.ownedTotal : ''}
              placeholder="0"
              onChange={(event) => onManualAmountChange(material.prefabName, Number(event.target.value) || 0)}
              aria-label={t('planner.craft.manualHave')}
              className="w-8 bg-transparent text-right text-[11.5px] font-bold tabular-nums text-[var(--text)] outline-none"
            />
            <span className="text-[10.5px] font-medium text-[var(--muted)]">/ {material.required}</span>
          </div>
        )}
      </div>
    </li>
  )
}

function QualityDropdown({
  value,
  maxQuality,
  onChange,
}: {
  value: number
  maxQuality: number
  onChange: (quality: number) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const selectedQuality = Math.min(value, maxQuality)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-black/25 px-2.5 transition-colors hover:border-[var(--border-strong)] hover:bg-white/[0.04]"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          {t('planner.craft.qualityLabel')}
        </span>
        <span className="text-[12px] font-semibold tracking-wider text-[var(--accent-text)]">
          {'★'.repeat(selectedQuality)}
        </span>
        <ChevronDown
          size={12}
          className={cn('text-[var(--muted)] transition-transform duration-150', open ? 'rotate-180' : '')}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 min-w-[130px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-1 shadow-2xl backdrop-blur-xl"
        >
          {Array.from({ length: maxQuality }, (_, index) => index + 1).map((quality) => {
            const isSelected = quality === selectedQuality
            return (
              <button
                key={quality}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(quality)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12px] font-semibold transition-colors',
                  isSelected
                    ? 'bg-[var(--surface-hover)] text-[var(--accent-text)]'
                    : 'text-[var(--text)] hover:bg-white/[0.08]',
                )}
              >
                <span className="tracking-wider">{'★'.repeat(quality)}</span>
                <span className="text-[10px] font-normal text-[var(--muted)]">Lvl {quality}</span>
                {isSelected ? <Check size={12} className="shrink-0 text-[var(--accent-text)]" aria-hidden="true" /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/**
 * One craft, one screen: the item on top, everything it needs below, and a
 * real place to get each missing material.
 */
export function CraftHero({
  graph,
  target,
  result,
  calculation,
  materials,
  intermediates,
  manualDisabled,
  inventoryStatus,
  inventoryUpdatedAt,
  inventoryError,
  inventoryScope,
  inventoryActions,
  hintFor,
  holdingsFor,
  onGoToContainers,
  hasWorldData,
  onRefreshWorldData,
  onQuantityChange,
  onQualityChange,
  onChangeItem,
  onDelete,
  onManualAmountChange,
  onGo,
}: CraftHeroProps) {
  const { t } = useTranslation()
  const [intermediatesOpen, setIntermediatesOpen] = useState(false)
  const item = graph.items.get(target.prefabName.toLowerCase()) ?? null
  const name = item?.name ?? target.prefabName
  const maxQuality = result?.maxQuality ?? item?.maxQuality ?? 1
  const missing = materials.filter((material) => material.missing > 0)
  const completion = calculation.totals.completion

  return (
    <div className="flex h-full min-h-0 flex-col items-start overflow-y-auto">
      <div className="w-full max-w-[760px] px-8 pb-10 pt-8">
        <div className="flex items-start gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-black/30 shadow-lg">
            {item?.icon
              ? <img src={item.icon} alt="" className="size-12 object-contain" />
              : <Hammer size={24} className="text-[var(--muted)]" aria-hidden="true" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h1 className="min-w-0 truncate text-[20px] font-bold tracking-tight text-[var(--text)]">{name}</h1>
              <InventoryStatusChip
                status={inventoryStatus}
                updatedAt={inventoryUpdatedAt}
                error={inventoryError}
                scope={inventoryScope}
                {...inventoryActions}
              />
            </div>
            <p className="mt-0.5 text-[11.5px] text-[var(--muted)]">
              {item?.isPiece
                ? t('planner.addTarget.buildPiece')
                : t(`item.types.${item?.type ?? 'unknown'}`, { defaultValue: item?.type ?? '' })}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="flex h-8 items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-black/25">
                <button
                  type="button"
                  onClick={() => onQuantityChange(Math.max(1, target.quantity - 1))}
                  disabled={target.quantity <= 1}
                  aria-label={t('planner.craft.decrease')}
                  className="grid h-full w-8 cursor-pointer place-items-center text-[var(--muted)] hover:text-[var(--text)] disabled:cursor-default disabled:opacity-35"
                >
                  <Minus size={13} aria-hidden="true" />
                </button>
                <span className="min-w-9 text-center text-[13px] font-bold tabular-nums text-[var(--text)]">
                  ×{target.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => onQuantityChange(Math.min(MAX_TARGET_QUANTITY, target.quantity + 1))}
                  disabled={target.quantity >= MAX_TARGET_QUANTITY}
                  aria-label={t('planner.craft.increase')}
                  className="grid h-full w-8 cursor-pointer place-items-center text-[var(--muted)] hover:text-[var(--text)] disabled:cursor-default disabled:opacity-35"
                >
                  <Plus size={13} aria-hidden="true" />
                </button>
              </div>
              {maxQuality > 1 ? (
                <QualityDropdown
                  value={target.targetQuality}
                  maxQuality={maxQuality}
                  onChange={onQualityChange}
                />
              ) : null}
              <button
                type="button"
                onClick={onChangeItem}
                className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-black/25 px-3 text-[11px] font-semibold text-[var(--text)] transition-colors hover:border-[var(--border-strong)] hover:bg-white/[0.04]"
              >
                <RefreshCw size={12} aria-hidden="true" />{t('planner.craft.changeItem')}
              </button>
              {onDelete ? (
                <button
                  type="button"
                  onClick={onDelete}
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-red-500/25 bg-red-500/[0.06] px-3 text-[11px] font-semibold text-red-400 hover:border-red-500/50 hover:bg-red-500/15 hover:text-red-300 transition-colors"
                  title={t('planner.craft.delete')}
                >
                  <Trash2 size={12} aria-hidden="true" />{t('planner.craft.delete')}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]/40 px-4 py-3">
          <ProgressRing
            completion={completion}
            size={36}
            label={t('planner.header.progressLabel', { percent: Math.round(completion * 100) })}
          />
          <p className="min-w-0 flex-1 text-[12px] text-[var(--muted)]">
            {missing.length === 0
              ? t('planner.craft.allCovered')
              : t('planner.overlay.remaining', { count: missing.length })}
          </p>
          {calculation.stations.length > 0 ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              {calculation.stations.map((station) => (
                <span
                  key={station.stationPrefab}
                  className="rounded-[var(--radius-full)] border border-[var(--border)] bg-black/25 px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]"
                  title={t('planner.stations.hint')}
                >
                  {station.name} · {t('item.stationLevel', { level: station.level })}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {(() => {
          const satisfiedCount = materials.length - missing.length
          const allSatisfied = completion >= 1 || (materials.length > 0 && missing.length === 0)
          return (
            <section className="mt-5">
              <h2 className={cn(
                'flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider',
                allSatisfied ? 'text-emerald-400' : 'text-[var(--muted)]',
              )}>
                {allSatisfied ? <Check size={13} className="shrink-0 text-emerald-400" aria-hidden="true" /> : null}
                <span>{allSatisfied ? t('planner.craft.allHaveTitle') : t('planner.craft.needsTitle')}</span>
                {materials.length > 0 ? (
                  <span className={cn('text-[10.5px] tabular-nums', allSatisfied ? 'font-bold text-emerald-400/90' : 'text-[var(--muted)]/70')}>
                    ({satisfiedCount}/{materials.length})
                  </span>
                ) : null}
              </h2>
              <ul className="mt-2 space-y-1.5">
                {materials.map((material) => (
                  <MaterialRow
                    key={material.prefabName}
                    graph={graph}
                    material={material}
                    manualDisabled={manualDisabled}
                    hint={hintFor(material.prefabName)}
                    holdings={holdingsFor(material.prefabName)}
                    onManualAmountChange={onManualAmountChange}
                    onGo={onGo}
                    onGoToContainers={onGoToContainers}
                  />
                ))}
              </ul>
            </section>
          )
        })()}

        {intermediates.length > 0 ? (
          <section className="mt-4">
            <button
              type="button"
              onClick={() => setIntermediatesOpen((value) => !value)}
              aria-expanded={intermediatesOpen}
              className="flex w-full cursor-pointer items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] hover:text-[var(--text)]"
            >
              <ChevronDown
                size={13}
                className={cn('transition-transform', intermediatesOpen ? 'rotate-0' : '-rotate-90')}
                aria-hidden="true"
              />
              {t('planner.craft.intermediatesTitle')} ({intermediates.length})
            </button>
            {intermediatesOpen ? (
              <ul className="mt-2 space-y-1">
                {intermediates.map((material) => {
                  const recipe = graph.recipesByOutput.get(material.prefabName.toLowerCase())?.[0]
                  const stationPrefab = recipe?.stationPrefab ?? ''
                  const stationLabel = stationPrefab
                    ? graph.stations.get(stationPrefab.toLowerCase())?.name ?? stationPrefab
                    : ''
                  return (
                    <li
                      key={material.prefabName}
                      className="flex items-center gap-2.5 rounded-[var(--radius-md)] bg-white/[0.02] px-3 py-2"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/25">
                        {material.item?.icon
                          ? <img src={material.item.icon} alt="" className="size-5 object-contain" />
                          : <Hammer size={11} className="text-[var(--muted)]" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--text)]">
                        {material.item?.name ?? material.prefabName}
                      </span>
                      <span className="shrink-0 text-[10.5px] text-[var(--muted)]">
                        {stationLabel
                          ? t('planner.craft.craftRuns', { count: material.missing, station: stationLabel })
                          : t('planner.craft.craftRunsHand', { count: material.missing })}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </section>
        ) : null}

        {calculation.warnings.length > 0 ? (
          <section className="mt-4 rounded-[var(--radius-md)] border border-amber-500/25 bg-amber-500/[0.07] p-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-amber-200">
              {t('planner.warnings.title')}
            </h3>
            <ul className="mt-1.5 space-y-1">
              {[...new Map(calculation.warnings.map((warning) =>
                [`${warning.code}:${warning.prefabName ?? ''}`, warning])).values()]
                .slice(0, 4)
                .map((warning) => (
                  <li
                    key={`${warning.code}:${warning.prefabName ?? ''}`}
                    className="text-[10.5px] leading-relaxed text-amber-100/90"
                  >
                    {t(`planner.warnings.${warning.code}`, {
                      name: warning.prefabName
                        ? graph.items.get(warning.prefabName.toLowerCase())?.name ?? warning.prefabName
                        : '',
                    })}
                  </li>
                ))}
            </ul>
          </section>
        ) : null}

        <footer className="mt-6 flex items-center justify-center gap-2 text-[10.5px] text-[var(--muted)]">
          {hasWorldData ? (
            <>
              <span>{t('planner.craft.worldData.fromSave')}</span>
              <button
                type="button"
                onClick={onRefreshWorldData}
                className="flex cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/20 px-2 py-1 font-semibold text-[var(--muted)] hover:text-[var(--text)]"
              >
                <RefreshCw size={10} aria-hidden="true" />{t('planner.craft.worldData.refresh')}
              </button>
            </>
          ) : (
            <span>{t('planner.craft.worldData.none')}</span>
          )}
        </footer>
      </div>
    </div>
  )
}
