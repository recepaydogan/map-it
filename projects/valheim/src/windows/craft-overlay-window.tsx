import { ArrowLeft, Check, ChevronDown, ChevronRight, GripHorizontal, PackageSearch, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlannerCatalog } from '../features/crafting-planner/hooks/use-planner-catalog'
import { useLiveInventory } from '../hooks/use-live-inventory'
import { useHotkeyRebind } from '../hooks/use-hotkey-rebind'
import { formatHotkeyBinding } from '../lib/hotkey-bindings'
import { useLiveContainers } from '../hooks/use-live-containers'
import { containersToStock } from '../lib/live-tracking/container-payload'
import type { PlanRequirementNode, PlanTarget } from '../lib/crafting/recipe-types'
import { allocateMaterialHoldings, type MaterialHolding } from '../lib/crafting/material-holdings'
import { showChestOnMap } from '../lib/crafting/chest-map-request'
import type { RememberedContainer } from '../lib/live-tracking/container-types'
import { calculatePlan } from '../lib/crafting/calculate-plan'
import { dragCurrentWindow, hideWindow } from '../overwolf-utils/window-manager'
import { useCraftOverlayStore } from '../store/craft-overlay-store'
import { useCraftingPlannerStore } from '../store/crafting-planner-store'
import { CompanionAutoLaunch } from '../features/crafting-planner/components/craft-auto-launch'
import { isOverwolf } from '../utils/overwolf'

function ItemIcon({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false)
  return <span className="craft-tracker-icon">
    {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : <PackageSearch size={20} aria-hidden="true" />}
  </span>
}

interface MaterialSourcesProps {
  holdings: Map<string, MaterialHolding>
  showSources: boolean
  chestName: (container: RememberedContainer) => string
  onChest: (container: RememberedContainer) => void
}
function MaterialBranch({ node, usable, depth = 0, holdings, showSources, chestName, onChest }: { node: PlanRequirementNode; usable: boolean; depth?: number } & MaterialSourcesProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const expandable = node.children.length > 0
  const Name = expandable ? 'button' : 'span'
  const showHoldings = showSources && usable && holdings.has(node.key)
  const name = node.item?.name ?? node.prefabName
  const sources = holdings.get(node.key)
  return <li data-complete={usable && node.net === 0}>
    <div className="craft-tracker-material-row" style={{
      display: 'grid',
      gridTemplateColumns: '42px minmax(0, 1fr) max-content 14px',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      paddingLeft: 4 + Math.min(depth, 5) * 12,
    }}>
      <ItemIcon key={node.item?.icon} src={node.item?.icon} />
      <div className="craft-tracker-material-copy">
      <Name className="craft-tracker-material-name" {...(expandable ? { type: 'button' as const, onClick: () => setOpen((value) => !value), 'aria-expanded': open } : {})}><span title={name}>{name}</span></Name>
      {showHoldings && sources && <div className="craft-tracker-sources">
        <span>{t('planner.tracker.inInventory', { count: sources.inventory })}</span>
        {sources.chests.length === 0 ? <span>{t('planner.tracker.inChests', { count: 0 })}</span> : sources.chests.map(({ container, amount }) =>
          <button key={container.id} type="button" onClick={() => onChest(container)} title={t('planner.tracker.locateChest')}>
            {chestName(container)} · {amount} ↗
          </button>)}
      </div>}
      </div>
      <span className="craft-tracker-count"><strong>{usable ? node.fromStock : '—'}<small> / {node.gross}</small></strong>
        <span>{usable ? node.net > 0 ? t('planner.tracker.missing', { count: node.net }) : t('planner.tracker.collected') : t('planner.tracker.unknown')}</span>
      </span>
      <span className="craft-tracker-branch-arrow">{expandable && <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`${t(open ? 'planner.overlay.collapse' : 'planner.overlay.expand')} ${name}`}><ChevronRight size={14} aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : undefined }} /></button>}</span>
    </div>
    {expandable && open && <ul>{node.children.map((child) => <MaterialBranch key={child.key} node={child} usable={usable} depth={depth + 1} holdings={holdings} showSources={showSources} chestName={chestName} onChest={onChest} />)}</ul>}
  </li>
}

export function CraftOverlayWindow({ embedded = false, companion = false, onClose }: { embedded?: boolean; companion?: boolean; onClose?: () => void } = {}) {
  const { t } = useTranslation()
  const hotkeys = useHotkeyRebind()
  const hotkeyName = companion ? 'toggle_companion' : 'toggle_craft_overlay'
  const binding = hotkeys.bindings[hotkeyName] ?? (!isOverwolf() ? companion ? 'Ctrl+Shift+C' : 'Ctrl+Alt+C' : '')
  const hotkeyLabel = binding ? formatHotkeyBinding(binding) : t(hotkeys.status === 'loading' ? 'common.loading' : 'settings.hotkeyUnassigned')
  const panel = useRef<HTMLElement>(null)
  const catalog = usePlannerCatalog()
  const inventory = useLiveInventory(false)
  const containers = useLiveContainers(inventory.snapshot?.worldUid ?? null)
  const [includeChests, setIncludeChests] = useState(true)
  const [choosing, setChoosing] = useState(embedded)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(40)
  const [selection, setSelection] = useState<PlanTarget | null>(null)
  const planId = useCraftOverlayStore((state) => state.planId)
  const plans = useCraftingPlannerStore((state) => state.plans)
  const plan = plans.find((entry) => entry.id === planId && !entry.archived)
  const [collapsed, setCollapsed] = useState(false)
  const usable = inventory.status === 'live' || inventory.status === 'stale'
  const matchingWorld = Boolean(inventory.snapshot?.worldUid && inventory.snapshot.worldUid === containers.worldUid)
  const chestStock = useMemo(() => includeChests && matchingWorld
    ? containersToStock(containers.containers, { ownContainers: true, friendContainers: true }) : {},
  [includeChests, matchingWorld, containers.containers])
  const stock = useMemo(() => {
    const result = { ...(usable ? inventory.stock : {}) }
    for (const [key, count] of Object.entries(chestStock)) result[key] = (result[key] ?? 0) + count
    return result
  }, [usable, inventory.stock, chestStock])
  const placementAliases = useMemo(() => {
    const aliases = new Map<string, string>()
    if (!catalog.graph) return aliases
    for (const item of catalog.graph.items.values()) {
      if (!item.isPiece) continue
      const recipe = catalog.graph.recipesByOutput.get(item.prefabName.toLowerCase())?.[0]
      if (recipe?.kind !== 'piece' || recipe.resources.length !== 1 || recipe.resources[0].amount !== 1) continue
      const ingredient = catalog.graph.items.get(recipe.resources[0].prefabName.toLowerCase())
      if (ingredient && !ingredient.isPiece && ingredient.name === item.name) aliases.set(item.prefabName.toLowerCase(), ingredient.prefabName)
    }
    return aliases
  }, [catalog.graph])
  const choices = useMemo(() => [...(catalog.graph?.items.values() ?? [])]
    .filter((item) => !placementAliases.has(item.prefabName.toLowerCase()))
    .filter((item) => `${item.name} ${item.prefabName}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [catalog.graph, query, placementAliases])
  const calculation = useMemo(() => catalog.graph && (selection || plan) ? calculatePlan({
    graph: catalog.graph,
    targets: (selection ? [selection] : plan!.targets).map((target) => {
      const preparedPrefab = placementAliases.get(target.prefabName.toLowerCase())
      return { ...target, prefabName: preparedPrefab ?? target.prefabName, recipeId: preparedPrefab ? null : target.recipeId, expandIntermediates: true, completed: false }
    }),
    stock,
    honorManualCompletion: false,
    recipeChoices: plan?.recipeChoices,
  }) : null, [catalog.graph, plan, selection, stock, placementAliases])

  const materialHoldings = useMemo(() => allocateMaterialHoldings(calculation, usable ? inventory.stock : {}, includeChests && matchingWorld ? containers.containers : []),
    [calculation, usable, inventory.stock, includeChests, matchingWorld, containers.containers])
  const [mapError, setMapError] = useState(false)
  const chestName = (container: RememberedContainer) => catalog.graph?.items.get(container.prefab.toLowerCase())?.name ?? t('planner.containers.chest')
  const locateChest = (container: RememberedContainer) => {
    if (!matchingWorld || !containers.worldUid) return
    setMapError(false)
    void showChestOnMap({ worldUid: containers.worldUid, seedName: inventory.snapshot?.seedName ?? '', containerId: container.id, prefab: container.prefab, x: container.x, z: container.z, label: chestName(container) }).catch(() => setMapError(true))
  }

  useEffect(() => {
    if (embedded || companion || !isOverwolf() || !panel.current) return
    let disposed = false
    let observer: ResizeObserver | null = null
    overwolf.windows.getCurrentWindow((result) => {
      if (disposed || !result.success || !panel.current) return
      observer = new ResizeObserver(([entry]) => {
        const height = Math.ceil(entry.target.getBoundingClientRect().height)
        overwolf.windows.changeSize({ window_id: result.window.id, width: 340, height: Math.max(80, height), auto_dpi_resize: true }, () => {})
      })
      observer.observe(panel.current)
    })
    return () => { disposed = true; observer?.disconnect() }
  }, [embedded, companion])

  useEffect(() => {
    const sync = () => {
      void useCraftOverlayStore.persist.rehydrate()
      void useCraftingPlannerStore.persist.rehydrate()
    }
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener('focus', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])

  useEffect(() => {
    if (embedded || companion || !isOverwolf() || localStorage.getItem('valheim-companion:craft-overlay-placed-v2')) return
    overwolf.windows.getCurrentWindow((result) => {
      if (!result.success) return
      // Below the quick slots in the upper-left; subsequent positions belong to the player.
      overwolf.windows.changePosition(result.window.id, 20, 100, (moved) => {
        if (moved.success) localStorage.setItem('valheim-companion:craft-overlay-placed-v2', '1')
      })
    })
  }, [embedded, companion])

  const target = calculation?.targets[0]
  const warningMessages = [...new Set((calculation?.warnings ?? [])
    .filter((warning) => warning.code !== 'nothing-to-do')
    .map((warning) => {
      const key = warning.prefabName?.toLowerCase() ?? ''
      const name = catalog.graph?.items.get(key)?.name ?? warning.prefabName ?? ''
      if (warning.code === 'no-recipe') {
        const drops = catalog.intelligence?.items[key]?.dropSources ?? []
        if (drops.length) return t('planner.tracker.obtainedFrom', { name, sources: [...new Set(drops.map((drop) => drop.name))].join(', ') })
      }
      return t(`planner.warnings.${warning.code}`, { name })
    }))]
  const ready = inventory.authoritative && (!includeChests || (matchingWorld && containers.status === 'live')) && target?.ready && !target.unresolved
  const dismiss = () => {
    if (embedded) { onClose?.(); return }
    useCraftOverlayStore.getState().setPlanId(null)
    if (isOverwolf()) void hideWindow(companion ? 'companion' : 'craft_overlay').catch(console.error)
    else window.close()
  }

  return <main ref={panel} className="craft-tracker" aria-label={t('planner.tracker.title')}>
    <header className="craft-tracker-bar">
      <div onMouseDown={(event) => { if (!embedded && event.button === 0) dragCurrentWindow() }} className="craft-tracker-drag" title={t(`settings.${hotkeyName}`)}>
        <GripHorizontal size={14} aria-hidden="true" /><span>{hotkeyLabel}</span>
      </div>
      {companion && <CompanionAutoLaunch />}
      {!choosing && target && <button type="button" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} aria-label={t(collapsed ? 'planner.overlay.expand' : 'planner.overlay.collapse')}>
        <ChevronDown size={15} style={{ transform: collapsed ? undefined : 'rotate(180deg)' }} />
      </button>}
      <button type="button" onClick={dismiss} aria-label={t('planner.tracker.stop')}><X size={15} /></button>
    </header>
    {catalog.loading ? <p className="craft-tracker-message">{t('common.loading')}</p>
      : catalog.error ? <p role="alert" className="craft-tracker-message">{t('planner.tracker.loadError')}</p>
      : choosing || !target ? <>
        <div className="craft-tracker-picker-heading"><h1>{t('planner.craft.pickerTitle')}</h1></div>
        <label className="craft-tracker-chests"><input type="checkbox" checked={includeChests} onChange={(event) => setIncludeChests(event.target.checked)} />{t('planner.tracker.includeChests')}</label>
        <input className="craft-tracker-search" aria-label={t('planner.craft.search')} placeholder={t('planner.craft.search')} value={query} onChange={(event) => { setQuery(event.target.value); setLimit(40) }} />
        <ul className="craft-tracker-choices">
          {choices.slice(0, limit).map((item) => <li key={item.prefabName}><button type="button" onClick={() => {
            const nextTarget: PlanTarget = { id: 'overlay-selection', prefabName: item.prefabName, quantity: 1, currentQuality: 0, targetQuality: 1, recipeId: null, expandIntermediates: false, note: '', completed: false }
            if (embedded) setSelection(nextTarget)
            else {
              const store = useCraftingPlannerStore.getState()
              const nextPlanId = store.createPlan(item.name)
              store.addTarget(nextPlanId, nextTarget)
              useCraftOverlayStore.getState().setPlanId(nextPlanId)
            }
            setChoosing(false)
            setCollapsed(false)
          }}><ItemIcon src={item.icon} /><span>{item.name}</span></button></li>)}
          {choices.length === 0 && <li className="craft-tracker-message">{t('planner.addTarget.noResults')}</li>}
          {choices.length > limit && <li><button type="button" onClick={() => setLimit((value) => value + 40)}>{t('planner.craft.showMore', { shown: limit, total: choices.length })}</button></li>}
        </ul>
      </>
      : <>
        <button type="button" className="craft-tracker-back" onClick={() => setChoosing(true)}><ArrowLeft size={13} />{t('planner.tracker.changeItem')}</button>
        <div className="craft-tracker-target">
          <ItemIcon key={target.prefabName} src={target.item?.icon} />
          <div><h1>{target.item?.name ?? target.prefabName}</h1><p>×{target.quantity} · {t('planner.tracker.quality', { count: target.targetQuality })}</p></div>
          {ready && <Check size={21} className="craft-tracker-ready" aria-label={t('planner.overlay.ready')} />}
        </div>
        {!collapsed && <>
          {target.recipe && <><div className="craft-tracker-columns"><span>{t('planner.tracker.material')}</span><span>{t('planner.tracker.haveNeed')}</span></div>
          <ul className="craft-tracker-materials">
            {calculation?.targets.flatMap((entry) => entry.requirements.map((node) =>
              <MaterialBranch key={`${entry.targetId}:${entry.prefabName}:${node.key}`} node={node} usable={usable} holdings={materialHoldings} showSources={includeChests} chestName={chestName} onChest={locateChest} />))}
          </ul></>}
          {mapError && <p role="alert" className="craft-tracker-notice">{t('planner.tracker.mapError')}</p>}
          {warningMessages.map((message) => <p key={message} role="status" className="craft-tracker-notice">{message}</p>)}
          {ready && <p className="craft-tracker-footer craft-tracker-ready">{t('planner.overlay.ready')}</p>}
          {!!calculation?.stations.length && <p className="craft-tracker-footer">{calculation.stations.map((station) => `${station.name} · ${t('planner.tracker.quality', { count: station.level })}`).join(' / ')}</p>}
        </>}
      </>}
  </main>
}
