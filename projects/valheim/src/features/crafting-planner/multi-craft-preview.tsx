import { ChevronRight, PackageSearch, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LiveInventoryState } from '../../hooks/use-live-inventory'
import type { LiveContainersState } from '../../hooks/use-live-containers'
import { containersToStock } from '../../lib/live-tracking/container-payload'
import { calculatePlan } from '../../lib/crafting/calculate-plan'
import { defaultRecipeFor } from '../../lib/crafting/build-recipe-graph'
import { allocateMaterialHoldings } from '../../lib/crafting/material-holdings'
import { showChestOnMap } from '../../lib/crafting/chest-map-request'
import type { RememberedContainer } from '../../lib/live-tracking/container-types'
import { CompanionMaterialList } from './components/companion-material-list'
import type { PlanRequirementNode } from '../../lib/crafting/recipe-types'
import { useCraftPreviewStore } from '../../store/craft-preview-store'
import { usePlannerCatalog } from './hooks/use-planner-catalog'
import './multi-craft-preview.css'

function SlotIcon({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false)
  return src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : <PackageSearch size={24} aria-hidden="true" />
}

function MaterialSlots({ nodes, usable }: { nodes: PlanRequirementNode[]; usable: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const selected = nodes.find((node) => node.key === expanded && node.children.length > 0)
  return <div className="multi-craft-branches">
    <ul className="multi-craft-slots">
      {nodes.map((node) => <li key={node.key}>
        <button type="button" className="multi-craft-slot" data-complete={usable && node.net === 0} data-expanded={selected?.key === node.key}
          disabled={!node.children.length} aria-label={`${node.item?.name ?? node.prefabName}: ${usable ? node.fromStock : '—'} / ${node.gross}`}
          aria-expanded={node.children.length ? expanded === node.key : undefined}
          title={node.item?.name ?? node.prefabName} onClick={() => setExpanded(expanded === node.key ? null : node.key)}>
          <SlotIcon key={node.prefabName} src={node.item?.icon} />
          <strong>{usable ? node.fromStock : '—'}<span> / {node.gross}</span></strong>
          {node.children.length > 0 && <ChevronRight className="multi-craft-slot-arrow" size={12} style={{ transform: selected?.key === node.key ? 'rotate(90deg)' : undefined }} />}
        </button>
        <span className="multi-craft-slot-label" title={node.item?.name ?? node.prefabName}>{node.item?.name ?? node.prefabName}</span>
      </li>)}
    </ul>
    {selected && <div className="multi-craft-child"><span>{selected.item?.name ?? selected.prefabName}</span><MaterialSlots key={selected.key} nodes={selected.children} usable={usable} /></div>}
  </div>
}

export function MultiCraftPreview({ inventory, containers, companion = false }: { inventory: LiveInventoryState; containers: LiveContainersState; companion?: boolean }) {
  const { t } = useTranslation()
  const catalog = usePlannerCatalog()
  const { targets, includeChests, setIncludeChests, add, remove, setQuantity } = useCraftPreviewStore()
  const [picking, setPicking] = useState(false)
  const picker = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  const [craftQuery, setCraftQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [mapError, setMapError] = useState(false)
  const [limit, setLimit] = useState(60)
  const [collapsedCrafts, setCollapsedCrafts] = useState<Set<string>>(() => new Set())
  const usable = inventory.status === 'live' || inventory.status === 'stale'
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === 'valheim-companion:multi-craft-preview' || event.key === null) void useCraftPreviewStore.persist.rehydrate()
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  useEffect(() => {
    const dialog = picker.current
    if (!picking || !dialog) return
    dialog.showModal()
    return () => { if (dialog.open) dialog.close() }
  }, [picking])
  const stock = useMemo(() => {
    const result = { ...(usable ? inventory.stock : {}) }
    if (includeChests && inventory.snapshot?.worldUid && inventory.snapshot.worldUid === containers.worldUid) {
      for (const [key, amount] of Object.entries(containersToStock(containers.containers, { ownContainers: true, friendContainers: true }))) result[key] = (result[key] ?? 0) + amount
    }
    return result
  }, [usable, inventory.stock, inventory.snapshot, includeChests, containers.worldUid, containers.containers])
  const calculation = useMemo(() => catalog.graph ? calculatePlan({ graph: catalog.graph,
    targets: targets.filter((target) => defaultRecipeFor(catalog.graph!, target.prefabName)),
    stock, honorManualCompletion: false }) : null, [catalog.graph, targets, stock])
  const matchingWorld = Boolean(inventory.snapshot?.worldUid && inventory.snapshot.worldUid === containers.worldUid)
  const holdings = useMemo(() => allocateMaterialHoldings(companion ? calculation : null, usable ? inventory.stock : {}, includeChests && matchingWorld ? containers.containers : []),
    [companion, calculation, usable, inventory.stock, includeChests, matchingWorld, containers.containers])
  const chestName = (container: RememberedContainer) => catalog.graph?.items.get(container.prefab.toLowerCase())?.name ?? t('planner.containers.chest')
  const locateChest = (container: RememberedContainer) => {
    if (!matchingWorld || !containers.worldUid) return
    setMapError(false)
    void showChestOnMap({ worldUid: containers.worldUid, seedName: inventory.snapshot?.seedName ?? '', containerId: container.id, prefab: container.prefab, x: container.x, z: container.z, label: chestName(container) }).catch(() => setMapError(true))
  }
  const choices = useMemo(() => [...(catalog.graph?.items.values() ?? [])]
    .filter((item) => catalog.graph && defaultRecipeFor(catalog.graph, item.prefabName))
    .filter((item) => `${item.name} ${item.prefabName}`.toLowerCase().includes((companion ? craftQuery : query).trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [catalog.graph, query, companion, craftQuery])
  const newChoices = choices.filter((item) => !targets.some((target) => target.prefabName.toLowerCase() === item.prefabName.toLowerCase()))

  const openPicker = () => { setQuery(''); setLimit(60); setPicking(true) }
  const visibleTargets = calculation?.targets.filter((target) => !companion || `${target.item?.name ?? ''} ${target.prefabName}`.toLowerCase().includes(craftQuery.trim().toLowerCase()))

  return <div className={`multi-craft-preview${companion ? ' multi-craft-companion' : ''}`}>
    {companion && <div className="multi-craft-toolbar" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false) }} onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false) }}>
      <label className="multi-craft-search"><Search size={15} /><input value={craftQuery} aria-label={t('planner.preview.searchTracked')} aria-expanded={searchOpen && newChoices.length > 0} aria-controls="companion-search-results" placeholder={t('planner.preview.searchTracked')} onFocus={() => setSearchOpen(true)} onChange={(event) => { setCraftQuery(event.target.value); setSearchOpen(true); setLimit(60) }} /></label>
      <label className="multi-craft-chests"><input type="checkbox" checked={includeChests} onChange={(event) => setIncludeChests(event.target.checked)} />{t('planner.tracker.includeChests')}</label>
      {searchOpen && newChoices.length > 0 && <ul id="companion-search-results" className="companion-search-results" aria-label={t('planner.preview.addCraft')}>
        {newChoices.slice(0, limit).map((item) => <li key={item.prefabName}><button type="button" onClick={() => { add(item.prefabName); setCraftQuery(''); setSearchOpen(false) }}><SlotIcon src={item.icon} /><span>{item.name}</span><small>{t('planner.preview.addCraft')}</small></button></li>)}
        {newChoices.length > limit && <li><button type="button" onClick={() => setLimit((value) => value + 60)}>{t('planner.craft.showMore', { shown: limit, total: newChoices.length })}</button></li>}
      </ul>}
    </div>}
    <div className="multi-craft-stage">
      {companion && mapError && <p role="alert" className="multi-craft-empty">{t('planner.tracker.mapError')}</p>}
      {companion && !visibleTargets?.length && (!craftQuery.trim() || !newChoices.length) && <p className="multi-craft-empty">{t(catalog.loading ? 'common.loading' : catalog.error ? 'planner.tracker.loadError' : craftQuery.trim() ? 'planner.addTarget.noResults' : 'planner.preview.emptyTracked')}</p>}
      {visibleTargets?.map((target, index) => <section key={target.targetId} className="multi-craft-row" aria-label={target.item?.name ?? target.prefabName}>
        <div className="multi-craft-heading"><span>{target.item?.name ?? target.prefabName}</span>
          <label>× <input type="number" min={1} max={999} value={target.quantity} aria-label={t('planner.preview.quantity', { name: target.item?.name ?? target.prefabName })} onChange={(event) => setQuantity(target.targetId, Number(event.target.value))} /></label>
          <button type="button" className={companion ? 'companion-remove' : undefined} onClick={() => remove(target.targetId)} aria-label={t('planner.preview.remove', { name: target.item?.name ?? target.prefabName })}>{companion ? <><Trash2 size={12} /><span>{t('planner.preview.removeButton')}</span></> : <X size={13} />}</button>
        </div>
        <div className="multi-craft-line">
          <div className="multi-craft-slot multi-craft-target" title={target.item?.name ?? target.prefabName}><small>{index + 1}</small><SlotIcon key={target.prefabName} src={target.item?.icon} /></div>
          <button type="button" className="multi-craft-separator" aria-expanded={!collapsedCrafts.has(target.targetId)}
            aria-controls={`craft-materials-${target.targetId}`}
            aria-label={t(collapsedCrafts.has(target.targetId) ? 'planner.preview.showMaterials' : 'planner.preview.hideMaterials')}
            onClick={() => setCollapsedCrafts((current) => {
              const next = new Set(current)
              if (next.has(target.targetId)) next.delete(target.targetId)
              else next.add(target.targetId)
              return next
            })}>
            <ChevronRight size={15} aria-hidden="true" style={{ transform: companion ? collapsedCrafts.has(target.targetId) ? undefined : 'rotate(90deg)' : collapsedCrafts.has(target.targetId) ? 'rotate(180deg)' : undefined }} />
          </button>
          <div id={`craft-materials-${target.targetId}`} className="multi-craft-materials-reveal" data-collapsed={collapsedCrafts.has(target.targetId)} inert={collapsedCrafts.has(target.targetId)} aria-hidden={collapsedCrafts.has(target.targetId)}>
            <div className="multi-craft-materials-clip">{companion
              ? <CompanionMaterialList nodes={target.requirements} usable={usable} includeChests={includeChests} chestsKnown={matchingWorld && (containers.status === 'live' || containers.status === 'remembered')} holdings={holdings} chestName={chestName} onChest={locateChest} />
              : <MaterialSlots nodes={target.requirements} usable={usable} />}</div>
          </div>
        </div>
      </section>)}
      {!companion && <button type="button" className="multi-craft-slot multi-craft-add" onClick={openPicker} aria-label={t('planner.plan.new')} title={t('planner.plan.new')}><Plus size={16} /></button>}
    </div>
    {picking && <dialog ref={picker} className="multi-craft-picker-backdrop" aria-label={t('planner.preview.pickTitle')} onCancel={() => setPicking(false)} onClick={() => setPicking(false)}>
      <section className="multi-craft-picker" aria-label={t('planner.preview.pickTitle')} onClick={(event) => event.stopPropagation()}>
        <header><h1>{t('planner.preview.pickTitle')}</h1><button type="button" onClick={() => setPicking(false)} aria-label={t('planner.addTarget.close')}><X size={16} /></button></header>
        <label className="multi-craft-chests"><input type="checkbox" checked={includeChests} onChange={(event) => setIncludeChests(event.target.checked)} />{t('planner.tracker.includeChests')}</label>
        <label className="multi-craft-search"><Search size={15} /><input autoFocus value={query} aria-label={t('planner.craft.search')} placeholder={t('planner.craft.search')} onChange={(event) => { setQuery(event.target.value); setLimit(60) }} /></label>
        {catalog.loading ? <p>{t('common.loading')}</p> : catalog.error ? <p role="alert">{t('planner.tracker.loadError')}</p> : <ul>
          {choices.slice(0, limit).map((item) => <li key={item.prefabName}><button type="button" onClick={() => {
              add(item.prefabName)
              setCraftQuery('')
              setPicking(false)
            }}><SlotIcon key={item.prefabName} src={item.icon} /><span>{item.name}</span><Plus size={13} /></button></li>)}
          {choices.length === 0 && <li>{t('planner.addTarget.noResults')}</li>}
          {choices.length > limit && <li><button type="button" onClick={() => setLimit((value) => value + 60)}>{t('planner.craft.showMore', { shown: limit, total: choices.length })}</button></li>}
        </ul>}
      </section>
    </dialog>}
  </div>
}
