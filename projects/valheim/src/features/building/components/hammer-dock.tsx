import {
  ChevronDown,
  ChevronUp,
  Eraser,
  Hammer,
  Layers,
  Mountain,
  RotateCw,
  Search,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import {
  PALETTE,
  PIECE_KINDS,
  ROCK_SIZES,
  pieceFootprint,
  type BuildingCatalog,
  type PieceKind,
  type Yaw,
} from '../../../lib/building/building-catalog.ts'
import { PLAYER_MATERIALS, type MaterialClass } from '../../../lib/building/support-model.ts'
import type { BuildTool } from '../../../store/building-sim-store.ts'
import type { Vec3 } from '../../../lib/building/support-solver.ts'
import { materialLabel } from '../presentation.ts'

interface HammerDockProps {
  catalog: BuildingCatalog
  material: MaterialClass
  tool: BuildTool
  yaw: Yaw
  onMaterial: (material: MaterialClass) => void
  onTool: (tool: BuildTool) => void
  onRotate: () => void
}

const MATERIAL_SWATCH: Record<MaterialClass, { bg: string; border: string }> = {
  Wood: { bg: '#a57a48', border: '#d4a366' },
  HardWood: { bg: '#8a5c33', border: '#b8814d' },
  Stone: { bg: '#8d8a80', border: '#b5b2a6' },
  Iron: { bg: '#6c7078', border: '#9aa0ab' },
  Marble: { bg: '#3a3b42', border: '#5e606b' },
  Ashstone: { bg: '#5c5753', border: '#857e78' },
  Ancient: { bg: '#4a453f', border: '#706960' },
}

const KIND_LABEL_KEYS: Record<PieceKind, string> = {
  pole: 'building.palette.kinds.pole',
  beam: 'building.palette.kinds.beam',
  wall: 'building.palette.kinds.wall',
  floor: 'building.palette.kinds.floor',
  stair: 'building.palette.kinds.stair',
  arch: 'building.palette.kinds.arch',
  door: 'building.palette.kinds.door',
  block: 'building.palette.kinds.block',
}

export function HammerDock({
  catalog,
  material,
  tool,
  yaw,
  onMaterial,
  onTool,
  onRotate,
}: HammerDockProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(true)
  const [selectedKind, setSelectedKind] = useState<PieceKind | 'all'>('all')
  const [query, setQuery] = useState('')
  const [rockMenuOpen, setRockMenuOpen] = useState(false)

  const availableKinds = useMemo(() => {
    const list: PieceKind[] = []
    const mapping = PALETTE[material]
    for (const kind of PIECE_KINDS) {
      if (mapping[kind] && mapping[kind]!.length > 0) {
        list.push(kind)
      }
    }
    return list
  }, [material])

  const piecesForMaterial = useMemo(() => {
    const prefabs = new Set<string>()
    const mapping = PALETTE[material]
    for (const kind of PIECE_KINDS) {
      const items = mapping[kind]
      if (items) {
        for (const prefab of items) prefabs.add(prefab)
      }
    }
    return Array.from(prefabs)
      .map((prefab) => catalog.pieces.get(prefab))
      .filter((piece): piece is NonNullable<typeof piece> => Boolean(piece))
  }, [catalog, material])

  const filteredPieces = useMemo(() => {
    const q = query.trim().toLowerCase()
    return piecesForMaterial.filter((piece) => {
      if (selectedKind !== 'all') {
        const mapping = PALETTE[material][selectedKind]
        if (!mapping || !mapping.includes(piece.prefabName)) return false
      }
      if (q) {
        const nameMatch = piece.name.toLowerCase().includes(q)
        const prefabMatch = piece.prefabName.toLowerCase().includes(q)
        if (!nameMatch && !prefabMatch) return false
      }
      return true
    })
  }, [material, piecesForMaterial, query, selectedKind])

  const activePrefab = tool.kind === 'place' ? tool.prefabName : null
  const activePiece = activePrefab ? catalog.pieces.get(activePrefab) : null

  const handleSelectPiece = (prefabName: string) => {
    onTool({ kind: 'place', prefabName })
  }

  const handleSelectRock = (size: Vec3) => {
    onTool({ kind: 'rock', size })
    setRockMenuOpen(false)
  }

  const yawDegrees = yaw * 90

  return (
    <aside
      aria-label={t('building.hammerDock.title', { defaultValue: 'Hammer Build Menu' })}
      className={cn(
        'pointer-events-auto flex flex-col rounded-[var(--radius-lg)] border border-[var(--border-strong)]/80 bg-[var(--overlay-background)] shadow-2xl backdrop-blur-2xl transition-all duration-200',
        expanded ? 'w-[min(780px,calc(100vw-2rem))] max-h-[360px]' : 'w-auto'
      )}
    >
      {/* Header bar / Quick Action Strip */}
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-[var(--radius-sm)] border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <Hammer size={14} aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <p className="text-[12px] font-bold tracking-wide text-[var(--text)]">
              {t('building.hammerDock.hammer', { defaultValue: 'Valheim Hammer' })}
            </p>
            <p className="text-[10px] text-[var(--muted)]">
              {tool.kind === 'place' && activePiece
                ? activePiece.name
                : tool.kind === 'rock'
                  ? t('building.pieces.rock', { defaultValue: 'Rock Foundation' })
                  : t('building.toolbar.erase', { defaultValue: 'Demolish Tool' })}
            </p>
          </div>
        </div>

        {/* Quick controls: Rotate, Demolish, Rock, Toggle Expand */}
        <div className="flex items-center gap-1.5">
          {/* Rotate button with angle badge */}
          <button
            type="button"
            onClick={onRotate}
            title={t('building.toolbar.rotateHint', { defaultValue: 'Rotate 90° (R)' })}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/40 px-2.5 text-[11px] font-semibold text-[var(--text)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-text)]"
          >
            <RotateCw size={13} aria-hidden="true" />
            <span className="tabular-nums">{yawDegrees}°</span>
          </button>

          {/* Demolish / Erase */}
          <button
            type="button"
            onClick={() => onTool({ kind: 'erase' })}
            aria-pressed={tool.kind === 'erase'}
            title={t('building.toolbar.eraseHint', { defaultValue: 'Demolish (Click to remove, Right-click anytime)' })}
            className={cn(
              'flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 text-[11px] font-semibold transition-colors',
              tool.kind === 'erase'
                ? 'border-[#ff5a5a] bg-[#ff2a2a]/20 text-[#ff8a8a]'
                : 'border-[var(--border)] bg-black/40 text-[var(--text)] hover:border-white/20'
            )}
          >
            <Eraser size={13} aria-hidden="true" />
            <span className="hidden sm:inline">{t('building.toolbar.erase', { defaultValue: 'Demolish' })}</span>
          </button>

          {/* Rock Foundation dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (tool.kind === 'rock') {
                  setRockMenuOpen((v) => !v)
                } else {
                  onTool({ kind: 'rock', size: ROCK_SIZES[0] })
                }
              }}
              aria-pressed={tool.kind === 'rock'}
              title={t('building.pieces.rockHint', { defaultValue: 'Terrain bedrock foundation' })}
              className={cn(
                'flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 text-[11px] font-semibold transition-colors',
                tool.kind === 'rock'
                  ? 'border-[var(--accent)] bg-[var(--surface-hover)] text-[var(--accent-text)]'
                  : 'border-[var(--border)] bg-black/40 text-[var(--text)] hover:border-white/20'
              )}
            >
              <Mountain size={13} aria-hidden="true" />
              <span>{t('building.pieces.rock', { defaultValue: 'Rock' })}</span>
              <ChevronDown size={11} className="opacity-70" aria-hidden="true" />
            </button>

            {rockMenuOpen ? (
              <ul
                role="menu"
                className="absolute bottom-10 right-0 z-40 flex min-w-[140px] flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-black/90 p-1.5 shadow-2xl backdrop-blur-2xl"
              >
                <li className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  {t('building.pieces.rockSizes', { defaultValue: 'Rock Dimensions' })}
                </li>
                {ROCK_SIZES.map((size) => (
                  <li key={`${size.x}x${size.y}x${size.z}`}>
                    <button
                      type="button"
                      onClick={() => handleSelectRock(size)}
                      className={cn(
                        'flex w-full cursor-pointer items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors',
                        tool.kind === 'rock' && tool.size.x === size.x && tool.size.y === size.y && tool.size.z === size.z
                          ? 'bg-[var(--surface-hover)] font-bold text-[var(--accent-text)]'
                          : 'text-[var(--text)] hover:bg-white/10'
                      )}
                    >
                      <span>{size.x} × {size.y} × {size.z} m</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <span className="mx-0.5 h-5 w-px bg-[var(--border)]" />

          {/* Toggle Expand / Collapse */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? t('common.collapse', { defaultValue: 'Collapse build menu' }) : t('common.expand', { defaultValue: 'Expand build menu' })}
            className="grid size-8 cursor-pointer place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/40 text-[var(--muted)] transition-colors hover:border-white/20 hover:text-[var(--text)]"
          >
            {expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronUp size={15} aria-hidden="true" />}
          </button>
        </div>
      </header>

      {/* Expanded Catalog view */}
      {expanded ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Material Category Tabs */}
          <nav
            aria-label={t('building.materials.tabLabel', { defaultValue: 'Materials' })}
            className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-black/30 px-3 py-1.5"
          >
            {PLAYER_MATERIALS.map((mat) => {
              const active = mat === material
              const swatch = MATERIAL_SWATCH[mat]
              return (
                <button
                  key={mat}
                  type="button"
                  onClick={() => {
                    onMaterial(mat)
                    setSelectedKind('all')
                    const list = PALETTE[mat]
                    const firstKind = PIECE_KINDS.find((k) => list[k] && list[k]!.length > 0)
                    if (firstKind && list[firstKind] && list[firstKind]!.length > 0) {
                      onTool({ kind: 'place', prefabName: list[firstKind]![0] })
                    }
                  }}
                  className={cn(
                    'flex shrink-0 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1 text-[11px] font-semibold transition-all',
                    active
                      ? 'border-[var(--accent)] bg-[var(--surface-hover)] text-[var(--accent-text)] shadow-sm'
                      : 'border-transparent bg-transparent text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]'
                  )}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ background: swatch.bg, boxShadow: `0 0 4px ${swatch.border}` }}
                  />
                  <span>{materialLabel(t, mat)}</span>
                </button>
              )
            })}
          </nav>

          {/* Subcategory Kind Filters & Search Bar */}
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)]/70 px-3 py-1.5">
            <div className="flex items-center gap-1 overflow-x-auto">
              <button
                type="button"
                onClick={() => setSelectedKind('all')}
                className={cn(
                  'cursor-pointer whitespace-nowrap rounded-[var(--radius-sm)] px-2 py-0.5 text-[10.5px] font-semibold transition-colors',
                  selectedKind === 'all'
                    ? 'bg-white/15 text-[var(--text)]'
                    : 'text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]'
                )}
              >
                {t('common.all', { defaultValue: 'All' })}
                <span className="ml-1 opacity-60">({piecesForMaterial.length})</span>
              </button>

              {availableKinds.map((kind) => {
                const count = PALETTE[material][kind]?.length ?? 0
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setSelectedKind(kind)}
                    className={cn(
                      'cursor-pointer whitespace-nowrap rounded-[var(--radius-sm)] px-2 py-0.5 text-[10.5px] font-semibold transition-colors',
                      selectedKind === kind
                        ? 'bg-white/15 text-[var(--text)]'
                        : 'text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]'
                    )}
                  >
                    {t(KIND_LABEL_KEYS[kind], { defaultValue: kind })}
                    <span className="ml-1 opacity-60">({count})</span>
                  </button>
                )
              })}
            </div>

            {/* Quick Search inside material */}
            <label className="flex h-7 w-36 shrink-0 items-center gap-1.5 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/40 px-2 text-[11px] focus-within:border-[var(--accent)]">
              <Search size={11} className="text-[var(--muted)]" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('common.search', { defaultValue: 'Filter...' })}
                className="w-full bg-transparent text-[11px] text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="cursor-pointer text-[var(--muted)] hover:text-[var(--text)]"
                >
                  <X size={10} aria-hidden="true" />
                </button>
              ) : null}
            </label>
          </div>

          {/* Piece Cards Grid */}
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5 overflow-y-auto p-2 sm:grid-cols-3 md:grid-cols-4">
            {filteredPieces.map((piece) => {
              const isSelected = activePrefab === piece.prefabName
              const footprint = pieceFootprint(piece)
              const sizeStr = footprint
                ? `${trimNumber(footprint.size.x)} × ${trimNumber(footprint.size.y)} × ${trimNumber(footprint.size.z)} m`
                : ''

              return (
                <button
                  key={piece.prefabName}
                  type="button"
                  onClick={() => handleSelectPiece(piece.prefabName)}
                  className={cn(
                    'group flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] border p-2 text-left transition-all',
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--surface-raised)] shadow-sm'
                      : 'border-[var(--border)]/60 bg-black/25 hover:border-[var(--border-strong)] hover:bg-white/5'
                  )}
                >
                  <div className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[var(--border)]/80 bg-black/45 p-1 transition-transform group-hover:scale-105">
                    {piece.icon ? (
                      <img src={piece.icon} alt="" className="size-9 object-contain" />
                    ) : (
                      <Layers size={18} className="text-[var(--muted)]" aria-hidden="true" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px] font-bold text-[var(--text)]">
                      {piece.name}
                    </p>
                    <p className="mt-0.5 truncate text-[9.5px] text-[var(--muted)]">
                      {sizeStr}
                    </p>

                    {/* Cost chips */}
                    {piece.resources.length > 0 ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {piece.resources.map((res) => (
                          <span
                            key={res.prefabName}
                            className="rounded-xs border border-white/10 bg-white/5 px-1 py-0.2 text-[9px] font-semibold text-[var(--text)]"
                          >
                            {res.amount}× {res.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </button>
              )
            })}

            {filteredPieces.length === 0 ? (
              <div className="col-span-full py-8 text-center text-xs text-[var(--muted)]">
                {t('database.noResults', { defaultValue: 'No pieces found' })}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </aside>
  )
}

const trimNumber = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))
