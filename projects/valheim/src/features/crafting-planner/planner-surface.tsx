import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { mergeStock } from '../../lib/crafting/allocate-inventory.ts'
import { calculatePlan } from '../../lib/crafting/calculate-plan.ts'
import type { PlanCalculation } from '../../lib/crafting/recipe-types.ts'
import {
  collectMapSources,
  resolveAcquisitionSources,
  type AcquisitionSource,
} from '../../lib/crafting/resolve-acquisition-sources.ts'
import type { ResourceStateIndex } from '../../lib/valheim/resource-state.ts'
import type { LiveInventoryState } from '../../hooks/use-live-inventory.ts'
import type { LiveContainersState } from '../../hooks/use-live-containers.ts'
import { holdingsFor, type ContainerHolding } from '../../lib/live-tracking/container-payload.ts'
import type { PlayerPosition } from '../../lib/live-tracking/tracking-installer'
import {
  selectActivePlan,
  useCraftingPlannerStore,
} from '../../store/crafting-planner-store.ts'
import type { PlannerMapSourceRequest } from '../../store/planner-map-source-store.ts'
import { CraftHero } from './components/craft-hero.tsx'
import { CraftPicker } from './components/craft-picker.tsx'
import { CraftRail, type CraftRailEntry } from './components/craft-rail.tsx'
import { PlannerToasts } from './components/planner-toasts.tsx'
import { usePlanCalculation } from './hooks/use-plan-calculation.ts'
import { usePlanNotifications } from './hooks/use-plan-notifications.ts'
import { usePlannerCatalog } from './hooks/use-planner-catalog.ts'
import { decorateMaterials } from './planner-presentation.ts'
import { resolveMaterialHint, type MaterialHint } from './resource-hints.ts'
import { buildSourceContext, collectConfirmedPoints } from './source-context.ts'

/**
 * Source resolution is lazy and cached per catalog version: hints are asked
 * for every missing material while the underlying data changes rarely.
 */
const acquisitionCaches = new Map<string, Map<string, AcquisitionSource[]>>()

const cachedAcquisitionSources = (
  graph: NonNullable<ReturnType<typeof usePlannerCatalog>['graph']>,
  intelligence: NonNullable<ReturnType<typeof usePlannerCatalog>['intelligence']>,
  prefabName: string,
): AcquisitionSource[] => {
  let cache = acquisitionCaches.get(graph.version)
  if (!cache) {
    cache = new Map()
    acquisitionCaches.clear()
    acquisitionCaches.set(graph.version, cache)
  }
  const key = prefabName.toLowerCase()
  const cached = cache.get(key)
  if (cached) return cached
  const resolved = resolveAcquisitionSources(graph, intelligence, prefabName).sources
  cache.set(key, resolved)
  return resolved
}

/** Player movement below this does not recompute nearest-source hints. */
const HINT_POSITION_GRID = 250

export interface PlannerSurfaceProps {
  inventory: LiveInventoryState
  /** Player-built chests reported by the mod (remembered per world). */
  containers: LiveContainersState
  /** Chest display name for a container token such as `$piece_chest_wood`. */
  translateToken: (token: string) => string | null
  /** Loot state parsed from the selected world's save; null while unavailable. */
  resourceIndex: ResourceStateIndex | null
  playerPosition: PlayerPosition | null
  onInstallTracker: () => void
  onRefreshWorldData: () => void
  onShowSourcesOnMap: (request: PlannerMapSourceRequest) => void
  /** Prefab queued by "Add to planner" in the Database. */
  pendingTargetPrefab: string | null
  onPendingTargetConsumed: () => void
}

export function PlannerSurface({
  inventory,
  containers,
  translateToken,
  resourceIndex,
  playerPosition,
  onInstallTracker,
  onRefreshWorldData,
  onShowSourcesOnMap,
  pendingTargetPrefab,
  onPendingTargetConsumed,
}: PlannerSurfaceProps) {
  const { t } = useTranslation()
  const catalog = usePlannerCatalog()
  const plans = useCraftingPlannerStore((state) => state.plans)
  const activePlanId = useCraftingPlannerStore((state) => state.activePlanId)
  const notifications = useCraftingPlannerStore((state) => state.notifications)
  const store = useCraftingPlannerStore
  const activePlan = useCraftingPlannerStore(selectActivePlan)
  const [changingItem, setChangingItem] = useState(false)

  // The surface always shows at least one craft, and always has one active.
  useEffect(() => {
    if (catalog.loading) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      const state = store.getState()
      if (state.plans.length === 0) state.createPlan(t('planner.plan.defaultName'))
      else if (!state.activePlanId) state.setActivePlan(state.plans[0].id)
    })
    return () => { cancelled = true }
  }, [catalog.loading, plans.length, activePlanId, store, t])

  const calculation = usePlanCalculation({
    graph: catalog.graph,
    plan: activePlan,
    liveStock: inventory.stock,
    liveAuthoritative: inventory.authoritative,
  })

  const railEntries = useMemo((): CraftRailEntry[] => {
    if (!catalog.graph) return []
    const graph = catalog.graph
    return plans.filter((plan) => !plan.archived).map((plan) => {
      const firstTarget = plan.targets[0] ?? null
      const item = firstTarget
        ? graph.items.get(firstTarget.prefabName.toLowerCase()) ?? null
        : null
      const planCalculation: PlanCalculation | null = plan.id === activePlan?.id && calculation
        ? calculation
        : firstTarget
          ? calculatePlan({
            graph,
            targets: plan.targets,
            stock: mergeStock(plan.manualOwned, inventory.stock),
            honorManualCompletion: !inventory.authoritative,
            recipeChoices: plan.recipeChoices,
          })
          : null
      return {
        plan,
        item,
        completion: planCalculation?.totals.completion ?? 0,
      }
    })
  }, [activePlan?.id, calculation, catalog.graph, inventory.authoritative, inventory.stock, plans])

  const sourcesFor = useCallback((prefabName: string): AcquisitionSource[] => {
    if (!catalog.graph || !catalog.intelligence) return []
    return cachedAcquisitionSources(catalog.graph, catalog.intelligence, prefabName)
  }, [catalog.graph, catalog.intelligence])

  const materials = useMemo(() => (calculation && activePlan
    ? decorateMaterials(
      calculation.materials,
      (prefabName) => sourcesFor(prefabName)[0]?.kind ?? 'unknown',
      activePlan.manualOwned,
    )
    : []), [activePlan, calculation, sourcesFor])

  const intermediates = useMemo(() => (calculation && activePlan
    ? decorateMaterials(
      calculation.intermediates,
      (prefabName) => sourcesFor(prefabName)[0]?.kind ?? 'unknown',
      activePlan.manualOwned,
    ).filter((material) => material.missing > 0)
    : []), [activePlan, calculation, sourcesFor])

  // Nearest-source hints move with the player, but only in coarse steps so a
  // walking player does not rescan hundreds of thousands of nodes per frame.
  const hintOriginX = Math.round((playerPosition?.x ?? 0) / HINT_POSITION_GRID) * HINT_POSITION_GRID
  const hintOriginZ = Math.round((playerPosition?.z ?? 0) / HINT_POSITION_GRID) * HINT_POSITION_GRID

  const hints = useMemo(() => {
    const origin = { x: hintOriginX, z: hintOriginZ }
    const result = new Map<string, MaterialHint>()
    for (const material of materials) {
      if (material.missing <= 0) continue
      result.set(
        material.prefabName.toLowerCase(),
        resolveMaterialHint(material.prefabName, sourcesFor(material.prefabName), resourceIndex, origin),
      )
    }
    return result
  }, [hintOriginX, hintOriginZ, materials, resourceIndex, sourcesFor])

  const hintFor = useCallback((prefabName: string): MaterialHint =>
    hints.get(prefabName.toLowerCase()) ?? { kind: 'unknown' }, [hints])

  // "Which chest has it": nearest first, only chests the settings let count.
  const holdings = useMemo(() => {
    const origin = { x: hintOriginX, z: hintOriginZ }
    const result = new Map<string, ContainerHolding[]>()
    if (containers.containers.length === 0) return result
    for (const material of [...materials, ...intermediates]) {
      const found = holdingsFor(containers.containers, material.prefabName, containers.sources, origin)
      if (found.length > 0) result.set(material.prefabName.toLowerCase(), found)
    }
    return result
  }, [containers.containers, containers.sources, hintOriginX, hintOriginZ, intermediates, materials])
  const holdingsOf = useCallback(
    (prefabName: string): ContainerHolding[] => holdings.get(prefabName.toLowerCase()) ?? [],
    [holdings],
  )
  const containerName = useCallback((token: string, prefab: string) =>
    (token ? translateToken(token) : null) ?? t('planner.containers.chest', { defaultValue: prefab || 'Chest' }),
  [t, translateToken])

  const goToContainers = useCallback((prefabName: string) => {
    if (!catalog.graph || !activePlan) return
    const found = holdingsOf(prefabName)
    if (found.length === 0) return
    const itemName = catalog.graph.items.get(prefabName.toLowerCase())?.name ?? prefabName
    const points = found.map((holding) => ({
      x: holding.container.x,
      z: holding.container.z,
      nodePrefab: holding.container.prefab,
      containerId: holding.container.id,
      kind: 'container',
      status: 'present' as const,
      label: t('planner.containers.pointLabel', {
        chest: containerName(holding.container.name, holding.container.prefab),
        amount: holding.amount,
        item: itemName,
      }),
    }))
    const total = found.reduce((sum, holding) => sum + holding.amount, 0)
    onShowSourcesOnMap({
      planId: activePlan.id,
      label: itemName,
      materialPrefabs: [prefabName],
      locationPrefabs: [],
      characterPrefabs: [],
      points,
      focus: points[0],
      context: {
        action: 'loot',
        subject: t('planner.containers.subject', { count: found.length }),
        itemName,
        amountMin: total,
        amountMax: total,
        confirmedCount: found.length,
      },
    })
  }, [activePlan, catalog.graph, containerName, holdingsOf, onShowSourcesOnMap, t])

  const targetNameFor = useCallback(
    (targetId: string) => {
      const target = calculation?.targets.find((entry) => entry.targetId === targetId)
      return target?.item?.name ?? target?.prefabName ?? ''
    },
    [calculation],
  )
  const materialNameFor = useCallback(
    (prefabName: string) => catalog.graph?.items.get(prefabName.toLowerCase())?.name ?? prefabName,
    [catalog.graph],
  )
  usePlanNotifications(activePlan?.id ?? null, calculation, notifications, targetNameFor, materialNameFor)

  const setCraftItem = useCallback((prefabName: string, planId?: string) => {
    const state = store.getState()
    const targetPlanId = planId ?? state.activePlanId ?? state.createPlan(t('planner.plan.defaultName'))
    const plan = state.plans.find((entry) => entry.id === targetPlanId)
    const existing = plan?.targets[0]
    if (existing) {
      state.updateTarget(targetPlanId, existing.id, {
        prefabName,
        recipeId: null,
        completed: false,
        currentQuality: 0,
        targetQuality: 1,
      })
    } else {
      state.addTarget(targetPlanId, {
        prefabName,
        quantity: 1,
        currentQuality: 0,
        targetQuality: 1,
        recipeId: null,
        expandIntermediates: true,
        note: '',
        completed: false,
      })
    }
    setChangingItem(false)
  }, [store, t])

  // "Add to planner" in the Database fills the active craft if it is still
  // empty, otherwise it becomes a new craft.
  useEffect(() => {
    if (!pendingTargetPrefab || !catalog.graph) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      const state = store.getState()
      const active = state.plans.find((entry) => entry.id === state.activePlanId)
      const planId = active && active.targets.length === 0
        ? active.id
        : state.createPlan(t('planner.plan.defaultName'))
      setCraftItem(pendingTargetPrefab, planId)
      onPendingTargetConsumed()
    })
    return () => { cancelled = true }
  }, [catalog.graph, onPendingTargetConsumed, pendingTargetPrefab, setCraftItem, store, t])

  const goToSource = useCallback((prefabName: string, hint: MaterialHint) => {
    if (!catalog.graph || !catalog.intelligence || !activePlan) return
    const graph = catalog.graph
    const label = graph.items.get(prefabName.toLowerCase())?.name ?? prefabName
    const sources = sourcesFor(prefabName)

    if ((hint.kind === 'confirmed' || hint.kind === 'respawning') && resourceIndex) {
      const origin = { x: hintOriginX, z: hintOriginZ }
      const confirmed = collectConfirmedPoints(resourceIndex, prefabName, origin)
      onShowSourcesOnMap({
        planId: activePlan.id,
        label,
        materialPrefabs: [prefabName],
        locationPrefabs: [],
        characterPrefabs: [],
        points: confirmed.points,
        focus: hint.point,
        context: buildSourceContext(graph, prefabName, hint, sources, confirmed.dominant, confirmed.total),
      })
      return
    }

    const selection = collectMapSources(graph, catalog.intelligence, [prefabName])
    onShowSourcesOnMap({
      planId: activePlan.id,
      label,
      ...selection,
      points: [],
      focus: null,
      context: buildSourceContext(graph, prefabName, hint, sources, null, 0),
    })
  }, [activePlan, catalog.graph, catalog.intelligence, hintOriginX, hintOriginZ, onShowSourcesOnMap, resourceIndex, sourcesFor])

  if (catalog.loading) {
    return (
      <div className="grid h-full place-items-center gap-2 bg-[var(--background)] text-[var(--muted)]">
        <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
        <p className="text-xs">{t('common.loading')}</p>
      </div>
    )
  }

  if (catalog.error || !catalog.graph) {
    return (
      <div className="grid h-full place-items-center gap-2 bg-[var(--background)] p-8 text-center">
        <TriangleAlert size={22} className="text-amber-300" aria-hidden="true" />
        <p className="text-[13px] font-semibold text-[var(--text)]">{t('planner.empty.catalogErrorTitle')}</p>
        <p className="max-w-md text-[11.5px] leading-relaxed text-[var(--muted)]">{t('planner.empty.catalogErrorDescription')}</p>
      </div>
    )
  }

  const graph = catalog.graph
  const activeTarget = activePlan?.targets[0] ?? null
  const showPicker = !activePlan || !activeTarget || changingItem

  return (
    <main className="relative flex h-full min-h-0 bg-[var(--background)]">
      <CraftRail
        entries={railEntries}
        activePlanId={activePlanId}
        onSelect={(planId) => {
          setChangingItem(false)
          store.getState().setActivePlan(planId)
        }}
        onCreate={() => {
          setChangingItem(false)
          store.getState().createPlan(t('planner.plan.defaultName'))
        }}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        {showPicker ? (
          <CraftPicker
            graph={graph}
            onBack={activeTarget && changingItem ? () => setChangingItem(false) : null}
            onPick={(prefabName) => setCraftItem(prefabName)}
          />
        ) : activePlan && activeTarget && calculation ? (
          <CraftHero
            planId={activePlan.id}
            graph={graph}
            target={activeTarget}
            result={calculation.targets.find((entry) => entry.targetId === activeTarget.id) ?? null}
            calculation={calculation}
            materials={materials}
            intermediates={intermediates}
            manualDisabled={inventory.authoritative}
            inventoryStatus={inventory.status}
            inventoryUpdatedAt={inventory.updatedAt}
            inventoryError={inventory.error}
            inventoryScope={inventory.snapshot
              ? { characterName: inventory.snapshot.characterName, worldName: inventory.snapshot.worldName }
              : null}
            inventoryActions={{
              onInstallTracker,
              onEnableInventory: () => void inventory.enable(),
              onDisableInventory: () => void inventory.disable(),
            }}
            hintFor={hintFor}
            holdingsFor={holdingsOf}
            onGoToContainers={goToContainers}
            hasWorldData={resourceIndex !== null}
            onRefreshWorldData={onRefreshWorldData}
            onQuantityChange={(quantity) =>
              store.getState().updateTarget(activePlan.id, activeTarget.id, { quantity })}
            onQualityChange={(targetQuality) =>
              store.getState().updateTarget(activePlan.id, activeTarget.id, { targetQuality })}
            onChangeItem={() => setChangingItem(true)}
            onDelete={() => store.getState().deletePlan(activePlan.id)}
            onManualAmountChange={(prefabName, amount) =>
              store.getState().setManualOwned(activePlan.id, prefabName, amount)}
            onGo={goToSource}
          />
        ) : null}
      </section>

      <PlannerToasts />
    </main>
  )
}
