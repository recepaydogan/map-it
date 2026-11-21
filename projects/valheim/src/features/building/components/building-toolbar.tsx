import {
  BookOpen,
  Box,
  Compass,
  Focus,
  GraduationCap,
  Hammer,
  Palette,
  RotateCcw,
  Scroll,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import type { CameraPreset, StudioMode } from '../../../store/building-sim-store.ts'

interface BuildingToolbarProps {
  mode: StudioMode
  colourAll: boolean
  canUndo: boolean
  canClear: boolean
  scenePieceCount: number
  onModeChange: (mode: StudioMode) => void
  onColourAll: (value: boolean) => void
  onUndo: () => void
  onClear: () => void
  onCameraPreset: (preset: CameraPreset) => void
  onReference: () => void
  onOpenBlueprints: () => void
}

export function BuildingToolbar({
  mode,
  colourAll,
  canUndo,
  canClear,
  scenePieceCount,
  onModeChange,
  onColourAll,
  onUndo,
  onClear,
  onCameraPreset,
  onReference,
  onOpenBlueprints,
}: BuildingToolbarProps) {
  const { t } = useTranslation()

  return (
    <header
      aria-label={t('building.toolbar.title', { defaultValue: 'Architect Studio Ribbon' })}
      className="pointer-events-auto flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-strong)]/80 bg-[var(--overlay-background)] px-3 py-1.5 shadow-2xl backdrop-blur-2xl"
    >
      {/* Left: Studio Mode Switcher */}
      <div className="flex items-center gap-1">
        {/* Sandbox mode */}
        <button
          type="button"
          onClick={() => onModeChange('sandbox')}
          className={cn(
            'flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-[11.5px] font-bold transition-all',
            mode === 'sandbox'
              ? 'bg-[var(--surface-hover)] text-[var(--accent-text)] shadow-md'
              : 'text-[var(--muted)] hover:bg-white/10 hover:text-[var(--text)]'
          )}
        >
          <Hammer size={14} aria-hidden="true" />
          <span>{t('building.rail.sandbox', { defaultValue: 'Sandbox' })}</span>
          {scenePieceCount > 0 ? (
            <span
              className={cn(
                'ml-0.5 rounded-full px-1.5 py-0.2 text-[9px] font-extrabold tabular-nums',
                mode === 'sandbox' ? 'bg-black/30 text-[var(--accent-contrast)]' : 'bg-white/10 text-[var(--accent-text)]'
              )}
            >
              {scenePieceCount}
            </span>
          ) : null}
        </button>

        {/* Blueprints / Presets button */}
        <button
          type="button"
          onClick={onOpenBlueprints}
          className={cn(
            'flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-[11.5px] font-bold transition-all',
            mode === 'blueprints'
              ? 'bg-[var(--surface-hover)] text-[var(--accent-text)] shadow-md'
              : 'text-[var(--muted)] hover:bg-white/10 hover:text-[var(--text)]'
          )}
        >
          <Scroll size={14} aria-hidden="true" />
          <span>{t('building.blueprints.title', { defaultValue: 'Blueprints' })}</span>
        </button>

        {/* Academy Lessons button */}
        <button
          type="button"
          onClick={() => onModeChange('lessons')}
          className={cn(
            'flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-[11.5px] font-bold transition-all',
            mode === 'lessons'
              ? 'bg-[var(--surface-hover)] text-[var(--accent-text)] shadow-md'
              : 'text-[var(--muted)] hover:bg-white/10 hover:text-[var(--text)]'
          )}
        >
          <GraduationCap size={14} aria-hidden="true" />
          <span>{t('building.lessons.title', { defaultValue: 'Academy Lessons' })}</span>
        </button>
      </div>

      {/* Middle: Camera view presets & Heatmap toggle */}
      <div className="flex items-center gap-1">
        {/* Heatmap color mode toggle */}
        <button
          type="button"
          onClick={() => onColourAll(!colourAll)}
          title={
            colourAll
              ? t('building.toolbar.colourAllOn', { defaultValue: 'Structural Heatmap ON (Click for in-game hover mode)' })
              : t('building.toolbar.colourAllOff', { defaultValue: 'In-Game Highlight ON (Click for structural heatmap)' })
          }
          className={cn(
            'flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 text-[11px] font-semibold transition-colors',
            colourAll
              ? 'border-[var(--accent)]/50 bg-[var(--surface-hover)] text-[var(--accent-text)]'
              : 'border-[var(--border)] bg-black/40 text-[var(--muted)] hover:text-[var(--text)]'
          )}
        >
          <Palette size={13} aria-hidden="true" />
          <span>{colourAll ? t('building.toolbar.heatmap', { defaultValue: 'Heatmap' }) : t('building.toolbar.classic', { defaultValue: 'Classic' })}</span>
        </button>

        <span className="mx-1 h-5 w-px bg-[var(--border)]" />

        {/* Camera Presets */}
        <button
          type="button"
          onClick={() => onCameraPreset('reset')}
          title={t('building.toolbar.fit', { defaultValue: 'Frame Scene (F)' })}
          className="grid size-8 cursor-pointer place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/40 text-[var(--muted)] hover:text-[var(--text)] hover:border-white/20"
        >
          <Focus size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onCameraPreset('iso')}
          title={t('building.camera.iso', { defaultValue: 'Isometric 3D View' })}
          className="grid size-8 cursor-pointer place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/40 text-[var(--muted)] hover:text-[var(--text)] hover:border-white/20"
        >
          <Box size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onCameraPreset('top')}
          title={t('building.camera.top', { defaultValue: 'Top-Down Plan View' })}
          className="grid size-8 cursor-pointer place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/40 text-[var(--muted)] hover:text-[var(--text)] hover:border-white/20"
        >
          <Compass size={14} aria-hidden="true" />
        </button>
      </div>

      {/* Right: Undo, Clear, Reference Matrix */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title={t('building.toolbar.undo', { defaultValue: 'Undo (Ctrl+Z)' })}
          className="grid size-8 cursor-pointer place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/40 text-[var(--muted)] transition-colors hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-35"
        >
          <RotateCcw size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!canClear}
          title={t('building.toolbar.clear', { defaultValue: 'Clear Scene' })}
          className="grid size-8 cursor-pointer place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/40 text-[var(--muted)] transition-colors hover:text-[#ff8a8a] disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>

        <span className="mx-1 h-5 w-px bg-[var(--border)]" />

        <button
          type="button"
          onClick={onReference}
          title={t('building.rail.reference', { defaultValue: 'Structural Matrix & Rules' })}
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/40 px-2.5 text-[11px] font-semibold text-[var(--text)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-text)]"
        >
          <BookOpen size={13} aria-hidden="true" />
          <span className="hidden md:inline">{t('building.rail.reference', { defaultValue: 'Reference' })}</span>
        </button>
      </div>
    </header>
  )
}
