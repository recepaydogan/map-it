import { ChevronRight, PackageSearch } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PlanRequirementNode } from '../../../lib/crafting/recipe-types'
import type { MaterialHolding } from '../../../lib/crafting/material-holdings'
import type { RememberedContainer } from '../../../lib/live-tracking/container-types'

interface Props {
  nodes: PlanRequirementNode[]
  usable: boolean
  includeChests: boolean
  chestsKnown: boolean
  holdings: Map<string, MaterialHolding>
  chestName: (container: RememberedContainer) => string
  onChest: (container: RememberedContainer) => void
}

function MaterialRow({ node, ...props }: Omit<Props, 'nodes'> & { node: PlanRequirementNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [chestsOpen, setChestsOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const { usable, includeChests, chestsKnown, holdings, chestName, onChest } = props
  const sources = holdings.get(node.key)
  const name = node.item?.name ?? node.prefabName
  const expandable = node.children.length > 0
  const Name = expandable ? 'button' : 'span'
  return <li className="companion-material" data-complete={usable && node.net === 0}>
    <div className="companion-material-row" data-expandable={expandable} onClick={(event) => {
      // Buttons handle their own actions; chest links must never toggle the recipe.
      if (!expandable || (event.target instanceof Element && event.target.closest('button'))) return
      setOpen((value) => !value)
    }}>
      <span className="companion-material-icon">{node.item?.icon && !failed ? <img src={node.item.icon} alt="" onError={() => setFailed(true)} /> : <PackageSearch size={22} />}</span>
      <div className="companion-material-copy">
        <Name className="companion-material-name" {...(expandable ? { type: 'button' as const, onClick: () => setOpen(!open), 'aria-expanded': open } : {})}>{name}</Name>
        {usable && sources ? <div className="companion-material-sources">
          <span>{t('planner.tracker.inInventory', { count: sources.inventory })}</span>
          {includeChests && (chestsKnown && sources.chests.length ? <button type="button" className="companion-chest-link" title={t('planner.tracker.locateChest')} aria-expanded={sources.chests.length > 1 ? chestsOpen : undefined} onClick={() => {
            if (sources.chests.length === 1) onChest(sources.chests[0].container)
            else setChestsOpen(!chestsOpen)
          }}>{t('planner.tracker.inChests', { count: sources.chests.reduce((sum, chest) => sum + chest.amount, 0) })}</button> : <span>{chestsKnown ? t('planner.tracker.inChests', { count: 0 }) : t('planner.preview.chestsUnavailable')}</span>)}
        </div> : <span className="companion-material-sources">{t('planner.tracker.unknown')}</span>}
      </div>
      <div className="companion-material-count"><strong>{usable ? node.fromStock : '—'}<small> / {node.gross}</small></strong>
        {usable && <span>{t(node.net === 0 ? 'planner.tracker.collected' : 'planner.tracker.missing', { count: node.net })}</span>}
      </div>
      {expandable && <button className="companion-material-expand" type="button" aria-expanded={open} aria-label={`${t(open ? 'planner.preview.hideMaterials' : 'planner.preview.showMaterials')}: ${name}`} onClick={() => setOpen(!open)}><ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : undefined }} /></button>}
      {usable && includeChests && chestsOpen && sources && sources.chests.length > 1 && <div className="companion-material-chests">{sources.chests.map(({ container, amount }, index) => <button key={container.id} type="button" title={t('planner.tracker.locateChest')} onClick={() => onChest(container)}>{chestName(container)} {index + 1} · {amount} ↗</button>)}</div>}
    </div>
    {expandable && open && <CompanionMaterialList {...props} nodes={node.children} />}
  </li>
}

export function CompanionMaterialList({ nodes, ...props }: Props) {
  return <ul className="companion-material-list">{nodes.map((node) => <MaterialRow key={node.key} node={node} {...props} />)}</ul>
}
