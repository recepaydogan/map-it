import { ArrowRight, ArrowUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { pieceFootprint, ROCK_PREFAB, type BuildingCatalog, type PlacedPiece } from '../../../lib/building/building-catalog.ts'
import { MATERIAL_PROPERTIES, remainingHops, rgbToCss, supportBand, supportColor } from '../../../lib/building/support-model.ts'
import type { SimBody, SupportSolution } from '../../../lib/building/support-solver.ts'
import { bandLabel, materialLabel } from '../presentation.ts'

interface FocusCardProps {
  catalog: BuildingCatalog
  piece: PlacedPiece
  body: SimBody
  solution: SupportSolution
}

/** The one small readout: what the piece under the cursor is doing. */
export function FocusCard({ catalog, piece, body, solution }: FocusCardProps) {
  const { t } = useTranslation()
  const result = solution.bodies.get(piece.id)
  const definition = piece.prefabName === ROCK_PREFAB ? null : catalog.pieces.get(piece.prefabName)
  const footprint = definition ? pieceFootprint(definition, piece.yaw) : null
  if (body.kind === 'static' || !result) {
    return (
      <div className="pointer-events-none flex items-center gap-2.5 rounded-[var(--radius-md)] border border-white/10 bg-black/65 px-3.5 py-2.5 shadow-xl backdrop-blur-xl">
        <p className="text-[12px] font-semibold text-[var(--text)]">{t('building.pieces.rock')}</p>
        <p className="text-[11px] text-[var(--muted)]">{t('building.pieces.rockHint')}</p>
      </div>
    )
  }
  const properties = MATERIAL_PROPERTIES[body.material]
  const colour = rgbToCss(supportColor(result.support, body.material))
  const band = supportBand(result.support, body.material)
  const up = remainingHops(result.support, body.material, body.max.y - body.min.y, 'vertical')
  const out = remainingHops(result.support, body.material, Math.max(body.max.x - body.min.x, body.max.z - body.min.z), 'horizontal')
  return (
    <div className="pointer-events-none flex items-center gap-3 rounded-[var(--radius-md)] border border-white/10 bg-black/65 px-3.5 py-2.5 shadow-xl backdrop-blur-xl">
      {definition?.icon ? <img src={definition.icon} alt="" className="size-9 shrink-0 object-contain" /> : null}
      <div className="min-w-0">
        <p className="truncate text-[12px] font-semibold text-[var(--text)]">
          {definition?.name ?? piece.prefabName}
          <span className="ml-1.5 font-normal text-[var(--muted)]">
            {materialLabel(t, body.material)}{footprint ? ` · ${footprint.size.x} × ${footprint.size.y} × ${footprint.size.z} m` : ''}
          </span>
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--muted)]">
          <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: result.collapses ? '#ff8a8a' : colour }}>
            <span className="inline-block size-2 rounded-full" style={{ background: colour }} />
            {bandLabel(t, band)}
          </span>
          <span className="tabular-nums text-[var(--text)]">{Math.round(result.support)} / {properties.maxSupport}</span>
          <span className="inline-flex items-center gap-1" title={t('building.inspector.moreUpHint')}><ArrowUp size={11} aria-hidden="true" />{up}</span>
          <span className="inline-flex items-center gap-1" title={t('building.inspector.moreOutHint')}><ArrowRight size={11} aria-hidden="true" />{out}</span>
        </p>
      </div>
    </div>
  )
}
