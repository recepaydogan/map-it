import {
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Layers,
  PackageCheck,
  PlusCircle,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import {
  pieceFootprint,
  ROCK_PREFAB,
  type BuildingCatalog,
  type PlacedPiece,
} from '../../../lib/building/building-catalog.ts'
import {
  MATERIAL_PROPERTIES,
  remainingHops,
  rgbToCss,
  supportBand,
  supportColor,
  type SupportBand,
} from '../../../lib/building/support-model.ts'
import type { SimBody, SupportSolution } from '../../../lib/building/support-solver.ts'
import { bandLabel, materialLabel } from '../presentation.ts'
import { useCraftingPlannerStore } from '../../../store/crafting-planner-store.ts'

interface BuildingTelemetryProps {
  catalog: BuildingCatalog
  scene: PlacedPiece[]
  solution: SupportSolution
  focusPiece: PlacedPiece | null
  focusBody: SimBody | null
  onSelectPiece: (id: string | null) => void
  onExportToPlanner?: () => void
}

const BAND_TEXT_COLOR: Record<SupportBand, string> = {
  grounded: '#99ccff',
  strong: '#73e673',
  fair: '#d4e655',
  weak: '#e69955',
  critical: '#ff5555',
  collapsing: '#ff2a2a',
}

export function BuildingTelemetry({
  catalog,
  scene,
  solution,
  focusPiece,
  focusBody,
  onSelectPiece,
  onExportToPlanner,
}: BuildingTelemetryProps) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const [plannerExported, setPlannerExported] = useState(false)

  // Focus piece calculation
  const focusResult = focusPiece ? solution.bodies.get(focusPiece.id) ?? null : null
  const focusDef = focusPiece && focusPiece.prefabName !== ROCK_PREFAB ? catalog.pieces.get(focusPiece.prefabName) : null
  const focusFootprint = focusDef ? pieceFootprint(focusDef, focusPiece?.yaw ?? 0) : null

  // Scene Total Resource Bill of Materials (BOM)
  const billOfMaterials = useMemo(() => {
    const map = new Map<string, { prefabName: string; name: string; amount: number }>()
    for (const placed of scene) {
      if (placed.prefabName === ROCK_PREFAB) continue
      const piece = catalog.pieces.get(placed.prefabName)
      if (!piece) continue
      for (const res of piece.resources) {
        const existing = map.get(res.prefabName)
        if (existing) {
          existing.amount += res.amount
        } else {
          map.set(res.prefabName, { ...res })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount)
  }, [catalog, scene])

  // Collapsing count & list
  const collapsingPieces = useMemo(() => {
    return solution.collapsed
      .map((id) => scene.find((p) => p.id === id))
      .filter((p): p is PlacedPiece => Boolean(p))
  }, [scene, solution.collapsed])

  // Add all BOM resources to a new Crafting Planner plan
  const handleExportToPlanner = () => {
    if (billOfMaterials.length === 0) return
    const plannerStore = useCraftingPlannerStore.getState()
    const planName = t('building.telemetry.planTitle', { count: scene.length, defaultValue: `Building Project (${scene.length} pcs)` })
    const planId = plannerStore.createPlan(planName)

    for (const item of billOfMaterials) {
      plannerStore.addTarget(planId, {
        prefabName: item.prefabName,
        quantity: item.amount,
        targetQuality: 1,
        currentQuality: 0,
        expandIntermediates: true,
        note: '',
        completed: false,
        recipeId: null,
      })
    }

    plannerStore.setActivePlan(planId)
    setPlannerExported(true)
    setTimeout(() => setPlannerExported(false), 2500)
    onExportToPlanner?.()
  }

  // Telemetry values for focus piece
  const properties = focusBody ? MATERIAL_PROPERTIES[focusBody.material] : null
  const supportVal = focusResult ? Math.round(focusResult.support) : 0
  const maxSupport = properties ? properties.maxSupport : 100
  const supportPercent = Math.min(100, Math.max(0, Math.round((supportVal / maxSupport) * 100)))
  const band = focusResult && focusBody ? supportBand(focusResult.support, focusBody.material) : 'grounded'
  const supportCssColor = focusResult && focusBody ? rgbToCss(supportColor(focusResult.support, focusBody.material)) : '#99ccff'

  const upHops = focusResult && focusBody
    ? remainingHops(focusResult.support, focusBody.material, focusBody.max.y - focusBody.min.y, 'vertical')
    : 0
  const outHops = focusResult && focusBody
    ? remainingHops(focusResult.support, focusBody.material, Math.max(focusBody.max.x - focusBody.min.x, focusBody.max.z - focusBody.min.z), 'horizontal')
    : 0
  const pieceHeight = focusBody ? focusBody.max.y - focusBody.min.y : 2
  const maxUpMeters = (upHops * pieceHeight).toFixed(1)

  return (
    <aside
      aria-label={t('building.telemetry.title', { defaultValue: 'Structural Telemetry' })}
      className={cn(
        'pointer-events-auto flex flex-col rounded-[var(--radius-lg)] border border-[var(--border-strong)]/80 bg-[var(--overlay-background)] shadow-2xl backdrop-blur-2xl transition-all duration-200',
        collapsed ? 'w-auto' : 'w-[320px] max-h-[calc(100vh-6.5rem)]'
      )}
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-[var(--radius-sm)] border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <Sparkles size={12} aria-hidden="true" />
          </span>
          <p className="text-[12px] font-bold text-[var(--text)]">
            {t('building.telemetry.title', { defaultValue: 'Structural Inspector' })}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? t('common.expand', { defaultValue: 'Expand Inspector' }) : t('common.collapse', { defaultValue: 'Collapse Inspector' })}
          className="grid size-7 cursor-pointer place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/40 text-[var(--muted)] hover:text-[var(--text)]"
        >
          {collapsed ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronUp size={14} aria-hidden="true" />}
        </button>
      </header>

      {!collapsed ? (
        <div className="flex min-h-0 flex-1 flex-col divide-y divide-[var(--border)]/70 overflow-y-auto">
          {/* Section 1: Focused / Selected Piece Details */}
          <section className="p-3">
            {focusPiece && focusBody ? (
              <div className="flex flex-col gap-2.5">
                {/* Piece identity badge */}
                <div className="flex items-start gap-2.5">
                  <div className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/50 p-1">
                    {focusDef?.icon ? (
                      <img src={focusDef.icon} alt="" className="size-8 object-contain" />
                    ) : (
                      <Layers size={16} className="text-[var(--muted)]" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-bold text-[var(--text)]">
                      {focusDef?.name ?? focusPiece.prefabName}
                    </p>
                    <p className="text-[10.5px] text-[var(--muted)]">
                      {materialLabel(t, focusBody.material)}
                      {focusFootprint
                        ? ` · ${focusFootprint.size.x} × ${focusFootprint.size.y} × ${focusFootprint.size.z} m`
                        : ''}
                    </p>
                  </div>
                </div>

                {/* Stability Gauge & Support Value */}
                {focusBody.kind !== 'static' && focusResult ? (
                  <div className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-white/10 bg-black/40 p-2.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-[var(--muted)]">
                        {t('building.telemetry.stability', { defaultValue: 'Integrity' })}
                      </span>
                      <span
                        className="font-bold uppercase tracking-wider"
                        style={{ color: BAND_TEXT_COLOR[band] }}
                      >
                        {bandLabel(t, band)}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-black/60">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.max(5, supportPercent)}%`,
                          background: supportCssColor,
                          boxShadow: `0 0 8px ${supportCssColor}`,
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10.5px] text-[var(--muted)]">
                      <span>
                        {t('building.telemetry.supportLoad', { defaultValue: 'Support Load' })}:
                      </span>
                      <span className="font-bold tabular-nums text-[var(--text)]">
                        {supportVal} / {maxSupport} ({supportPercent}%)
                      </span>
                    </div>

                    {/* Reach capacity chips */}
                    <div className="mt-1 grid grid-cols-2 gap-1.5 pt-1 border-t border-white/10">
                      <div className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-white/5 px-2 py-1 text-[10px]">
                        <ArrowUp size={12} className="text-[var(--accent-text)]" aria-hidden="true" />
                        <div>
                          <p className="font-bold text-[var(--text)]">+{maxUpMeters} m</p>
                          <p className="text-[9px] text-[var(--muted)]">+{upHops} pcs up</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-white/5 px-2 py-1 text-[10px]">
                        <ArrowRight size={12} className="text-[var(--accent-text)]" aria-hidden="true" />
                        <div>
                          <p className="font-bold text-[var(--text)]">+{outHops} pcs</p>
                          <p className="text-[9px] text-[var(--muted)]">cantilever out</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[var(--radius-md)] border border-white/10 bg-black/40 p-2 text-[11px] text-[var(--muted)]">
                    {t('building.pieces.rockHint', { defaultValue: 'Terrain object — grants 100% full ground support to all touching pieces.' })}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-2 text-center text-[11px] text-[var(--muted)]">
                {t('building.telemetry.hoverPrompt', { defaultValue: 'Hover or click any piece in the 3D scene to inspect its structural telemetry.' })}
              </div>
            )}
          </section>

          {/* Section 2: Collapse & Structural Health Alert */}
          {collapsingPieces.length > 0 ? (
            <section className="bg-[#ff2a2a]/10 p-3">
              <div className="flex items-center gap-2 text-[#ff8a8a]">
                <ShieldAlert size={15} aria-hidden="true" />
                <p className="text-[11.5px] font-bold">
                  {t('building.inspector.collapseNote', { count: collapsingPieces.length, defaultValue: `${collapsingPieces.length} unsupported piece(s) collapsing!` })}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {collapsingPieces.slice(0, 4).map((piece) => (
                  <button
                    key={piece.id}
                    type="button"
                    onClick={() => onSelectPiece(piece.id)}
                    className="cursor-pointer rounded-xs border border-[#ff5a5a]/40 bg-black/40 px-1.5 py-0.5 text-[9.5px] font-semibold text-[#ff8a8a] hover:bg-[#ff2a2a]/30"
                  >
                    {catalog.pieces.get(piece.prefabName)?.name ?? piece.prefabName}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section className="flex items-center gap-2 bg-emerald-950/20 px-3 py-2 text-emerald-400">
              <CheckCircle2 size={13} aria-hidden="true" />
              <p className="text-[11px] font-semibold">
                {t('building.telemetry.allSupported', { defaultValue: 'All structural pieces supported' })}
              </p>
            </section>
          )}

          {/* Section 3: Scene Summary & Bill of Materials (BOM) */}
          <section className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[11.5px] font-bold text-[var(--text)]">
                  {t('building.telemetry.bomTitle', { defaultValue: 'Bill of Materials' })}
                </p>
                <p className="text-[10px] text-[var(--muted)]">
                  {scene.length} {t('building.telemetry.piecesPlaced', { defaultValue: 'pieces placed in scene' })}
                </p>
              </div>

              {/* Add to Crafting Planner */}
              {billOfMaterials.length > 0 ? (
                <button
                  type="button"
                  onClick={handleExportToPlanner}
                  disabled={plannerExported}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-[10.5px] font-bold transition-colors',
                    plannerExported
                      ? 'bg-emerald-600 text-white'
                      : 'border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text)] hover:bg-[var(--surface-hover)]'
                  )}
                >
                  {plannerExported ? (
                    <>
                      <PackageCheck size={12} aria-hidden="true" />
                      <span>{t('building.telemetry.added', { defaultValue: 'Added!' })}</span>
                    </>
                  ) : (
                    <>
                      <PlusCircle size={12} aria-hidden="true" />
                      <span>{t('building.telemetry.toPlanner', { defaultValue: 'To Planner' })}</span>
                    </>
                  )}
                </button>
              ) : null}
            </div>

            {billOfMaterials.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-white/10 bg-black/30 p-2">
                {billOfMaterials.map((res) => (
                  <li
                    key={res.prefabName}
                    className="flex items-center justify-between text-[11px] text-[var(--text)]"
                  >
                    <span className="truncate text-[var(--muted)]">{res.name}</span>
                    <span className="font-bold tabular-nums text-[var(--accent-text)]">
                      {res.amount.toLocaleString()}×
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[10.5px] text-[var(--muted)] italic">
                {t('building.telemetry.emptyBOM', { defaultValue: 'Place pieces to calculate raw material costs.' })}
              </p>
            )}
          </section>
        </div>
      ) : null}
    </aside>
  )
}
