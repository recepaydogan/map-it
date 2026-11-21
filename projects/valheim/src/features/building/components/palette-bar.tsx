import { ChevronDown, Eraser, Mountain, RotateCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import {
  PALETTE,
  PIECE_KINDS,
  ROCK_SIZES,
  pieceFootprint,
  type BuildingCatalog,
  type PieceKind,
} from '../../../lib/building/building-catalog.ts'
import { PLAYER_MATERIALS, type MaterialClass } from '../../../lib/building/support-model.ts'
import type { BuildTool } from '../../../store/building-sim-store.ts'
import { materialLabel } from '../presentation.ts'

interface PaletteBarProps {
  catalog: BuildingCatalog
  material: MaterialClass
  tool: BuildTool
  variantChoice: Record<string, string>
  onMaterial: (material: MaterialClass) => void
  onTool: (tool: BuildTool) => void
  onVariant: (material: MaterialClass, kind: PieceKind, prefabName: string) => void
  onRotate: () => void
}

const kindOf = (prefabName: string, material: MaterialClass): PieceKind | null => {
  for (const kind of PIECE_KINDS) if (PALETTE[material][kind]?.includes(prefabName)) return kind
  return null
}

const sizeLabel = (catalog: BuildingCatalog, prefabName: string): string => {
  const piece = catalog.pieces.get(prefabName)
  const footprint = piece ? pieceFootprint(piece) : null
  if (!footprint) return ''
  const long = Math.max(footprint.size.x, footprint.size.z)
  const tall = footprint.size.y
  const kind = kindOf(prefabName, piece!.material)
  if (kind === 'pole') return `${trim(tall)} m`
  if (kind === 'beam') return `${trim(long)} m`
  if (kind === 'wall') return `${trim(long)}×${trim(tall)}`
  return `${trim(footprint.size.x)}×${trim(footprint.size.z)}`
}
const trim = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

/**
 * The floating build menu: one material, one chip per piece kind (click again
 * to cycle sizes), rock, erase, rotate. Nothing else lives up here.
 */
export function PaletteBar({ catalog, material, tool, variantChoice, onMaterial, onTool, onVariant, onRotate }: PaletteBarProps) {
  const { t } = useTranslation()
  const [materialMenu, setMaterialMenu] = useState(false)
  const [rockMenu, setRockMenu] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const activePrefab = tool.kind === 'place' ? tool.prefabName : null
  const activeKind = activePrefab ? kindOf(activePrefab, material) : null

  useEffect(() => {
    if (!materialMenu && !rockMenu) return
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) { setMaterialMenu(false); setRockMenu(false) }
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [materialMenu, rockMenu])

  const pickKind = (kind: PieceKind) => {
    const variants = PALETTE[material][kind]
    if (!variants || variants.length === 0) return
    const remembered = variantChoice[`${material}:${kind}`]
    let next = remembered && variants.includes(remembered) ? remembered : variants[0]
    if (activeKind === kind && activePrefab) {
      // Second click on the active kind cycles through its sizes.
      next = variants[(variants.indexOf(activePrefab) + 1) % variants.length]
      onVariant(material, kind, next)
    }
    onTool({ kind: 'place', prefabName: next })
  }

  const chooseMaterial = (next: MaterialClass) => {
    onMaterial(next)
    setMaterialMenu(false)
    const kind = activeKind && PALETTE[next][activeKind] ? activeKind : PIECE_KINDS.find((entry) => PALETTE[next][entry])
    if (!kind) return
    const variants = PALETTE[next][kind] ?? []
    const remembered = variantChoice[`${next}:${kind}`]
    onTool({ kind: 'place', prefabName: remembered && variants.includes(remembered) ? remembered : variants[0] })
  }

  return (
    <div ref={root} className="pointer-events-auto flex items-center gap-1 rounded-[var(--radius-md)] border border-white/10 bg-black/60 p-1 shadow-xl backdrop-blur-xl">
      <div className="relative">
        <button
          type="button"
          onClick={() => { setMaterialMenu((open) => !open); setRockMenu(false) }}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-[12px] font-semibold text-[var(--text)] hover:bg-white/10"
          aria-haspopup="menu"
          aria-expanded={materialMenu}
        >
          <span className="size-2.5 rounded-full" style={{ background: MATERIAL_SWATCH[material] }} />
          {materialLabel(t, material)}
          <ChevronDown size={12} className="text-[var(--muted)]" aria-hidden="true" />
        </button>
        {materialMenu ? (
          <ul role="menu" className="absolute left-0 top-10 z-30 min-w-[150px] rounded-[var(--radius-md)] border border-white/10 bg-black/85 p-1 shadow-2xl backdrop-blur-xl">
            {PLAYER_MATERIALS.map((entry) => (
              <li key={entry}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={entry === material}
                  onClick={() => chooseMaterial(entry)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[12px]',
                    entry === material ? 'bg-[var(--surface-hover)] text-[var(--text)]' : 'text-[var(--muted)] hover:bg-white/10 hover:text-[var(--text)]',
                  )}
                >
                  <span className="size-2.5 rounded-full" style={{ background: MATERIAL_SWATCH[entry] }} />
                  {materialLabel(t, entry)}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <span className="mx-0.5 h-6 w-px bg-white/10" />

      {PIECE_KINDS.map((kind) => {
        const variants = PALETTE[material][kind]
        if (!variants || variants.length === 0) return null
        const active = activeKind === kind
        const shown = active && activePrefab ? activePrefab : (variantChoice[`${material}:${kind}`] ?? variants[0])
        const piece = catalog.pieces.get(shown)
        return (
          <button
            key={kind}
            type="button"
            onClick={() => pickKind(kind)}
            title={`${piece?.name ?? kind}${variants.length > 1 ? ` · ${t('building.palette.cycleHint')}` : ''}`}
            aria-pressed={active}
            className={cn(
              'flex h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-2 transition-colors',
              active ? 'bg-[var(--surface-hover)] text-[var(--accent-text)]' : 'text-[var(--text)] hover:bg-white/10',
            )}
          >
            {piece?.icon ? <img src={piece.icon} alt="" className="size-6 object-contain" /> : null}
            <span className="flex flex-col items-start leading-none">
              <span className="text-[11px] font-semibold">{t(`building.palette.kinds.${kind}`)}</span>
              <span className={cn('mt-0.5 text-[9.5px] tabular-nums', active ? 'text-[var(--accent-contrast)]/80' : 'text-[var(--muted)]')}>{sizeLabel(catalog, shown)}</span>
            </span>
          </button>
        )
      })}

      <span className="mx-0.5 h-6 w-px bg-white/10" />

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            if (tool.kind === 'rock') { setRockMenu((open) => !open); return }
            onTool({ kind: 'rock', size: ROCK_SIZES[0] })
          }}
          title={t('building.pieces.rockHint')}
          aria-pressed={tool.kind === 'rock'}
          className={cn(
            'flex h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-[11px] font-semibold transition-colors',
            tool.kind === 'rock' ? 'bg-[var(--surface-hover)] text-[var(--accent-text)]' : 'text-[var(--text)] hover:bg-white/10',
          )}
        >
          <Mountain size={14} aria-hidden="true" />
          {t('building.pieces.rock')}
        </button>
        {rockMenu && tool.kind === 'rock' ? (
          <ul role="menu" className="absolute left-0 top-10 z-30 flex gap-1 rounded-[var(--radius-md)] border border-white/10 bg-black/85 p-1 shadow-2xl backdrop-blur-xl">
            {ROCK_SIZES.map((size) => (
              <li key={`${size.x}${size.y}${size.z}`}>
                <button
                  type="button"
                  onClick={() => { onTool({ kind: 'rock', size }); setRockMenu(false) }}
                  className={cn(
                    'cursor-pointer whitespace-nowrap rounded-[var(--radius-sm)] px-2 py-1.5 text-[11px] tabular-nums',
                    tool.size === size ? 'bg-[var(--surface-hover)] text-[var(--text)]' : 'text-[var(--muted)] hover:bg-white/10 hover:text-[var(--text)]',
                  )}
                >
                  {size.x}×{size.y}×{size.z} m
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onTool({ kind: 'erase' })}
        title={t('building.toolbar.eraseHint')}
        aria-pressed={tool.kind === 'erase'}
        className={cn(
          'flex h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-[11px] font-semibold transition-colors',
          tool.kind === 'erase' ? 'bg-[var(--surface-hover)] text-[var(--accent-text)]' : 'text-[var(--text)] hover:bg-white/10',
        )}
      >
        <Eraser size={14} aria-hidden="true" />
        {t('building.toolbar.erase')}
      </button>
      <button
        type="button"
        onClick={onRotate}
        title={t('building.toolbar.rotateHint')}
        className="grid size-9 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-[var(--text)] hover:bg-white/10"
        aria-label={t('building.toolbar.rotate')}
      >
        <RotateCw size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

const MATERIAL_SWATCH: Record<MaterialClass, string> = {
  Wood: '#b8864f',
  HardWood: '#8f5f33',
  Stone: '#9a9689',
  Iron: '#8a9099',
  Marble: '#3d3e47',
  Ashstone: '#6c6661',
  Ancient: '#5a544c',
}
