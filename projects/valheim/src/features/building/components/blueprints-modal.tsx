import {
  Anvil,
  Hammer,
  Home,
  Layers,
  Scroll,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import {
  BLUEPRINTS,
  type BlueprintDefinition,
} from '../blueprints.ts'

interface BlueprintsModalProps {
  activeBlueprintId: string | null
  onClose: () => void
  onPreviewBlueprint: (id: string) => void
  onApplyToSandbox: (blueprint: BlueprintDefinition) => void
}

const CATEGORY_ICONS: Record<BlueprintDefinition['category'], typeof Home> = {
  house: Home,
  tower: Anvil,
  bridge: Sparkles,
  bastion: Layers,
}

export function BlueprintsModal({
  activeBlueprintId,
  onClose,
  onPreviewBlueprint,
  onApplyToSandbox,
}: BlueprintsModalProps) {
  const { t } = useTranslation()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-black/65 p-6 backdrop-blur-md"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="blueprints-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-[760px] flex-col rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface)] shadow-2xl"
      >
        {/* Modal Header */}
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-[var(--radius-sm)] border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent-text)]">
              <Scroll size={16} aria-hidden="true" />
            </span>
            <div>
              <h2
                id="blueprints-title"
                className="font-[family-name:var(--font-display)] text-[15px] font-bold text-[var(--text)]"
              >
                {t('building.blueprints.title', { defaultValue: 'Architectural Blueprints & Starters' })}
              </h2>
              <p className="text-[11px] text-[var(--muted)]">
                {t('building.blueprints.subtitle', { defaultValue: 'Load structurally verified foundation templates to study or build upon.' })}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', { defaultValue: 'Close' })}
            className="grid size-8 cursor-pointer place-items-center rounded-full text-[var(--muted)] transition-colors hover:bg-white/10 hover:text-[var(--text)]"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        {/* Blueprint Cards Grid */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-5 md:grid-cols-2">
          {BLUEPRINTS.map((blueprint) => {
            const Icon = CATEGORY_ICONS[blueprint.category]
            const isPreviewing = activeBlueprintId === blueprint.id
            const placements = blueprint.build()
            const pieceCount = placements.length

            return (
              <div
                key={blueprint.id}
                className={cn(
                  'flex flex-col justify-between rounded-[var(--radius-md)] border p-4 transition-all',
                  isPreviewing
                    ? 'border-[var(--accent)] bg-[var(--surface-raised)] shadow-lg'
                    : 'border-[var(--border)] bg-black/35 hover:border-[var(--border-strong)]'
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-[var(--text)]">
                      <Icon size={12} className="text-[var(--accent-text)]" aria-hidden="true" />
                      <span className="capitalize">{blueprint.category}</span>
                    </span>
                    <span className="text-[10.5px] font-bold tabular-nums text-[var(--muted)]">
                      {pieceCount} pieces
                    </span>
                  </div>

                  <h3 className="text-[13px] font-bold text-[var(--text)]">
                    {t(blueprint.titleKey, { defaultValue: blueprint.id })}
                  </h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                    {t(blueprint.descriptionKey, { defaultValue: 'Architectural starter template.' })}
                  </p>
                </div>

                <div className="mt-4 flex items-center gap-2 pt-3 border-t border-[var(--border)]/60">
                  <button
                    type="button"
                    onClick={() => {
                      onPreviewBlueprint(blueprint.id)
                      onClose()
                    }}
                    className={cn(
                      'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border py-1.5 text-[11px] font-semibold transition-colors',
                      isPreviewing
                        ? 'border-[var(--accent)] bg-[var(--surface-hover)] text-[var(--accent-text)]'
                        : 'border-[var(--border)] bg-black/40 text-[var(--text)] hover:border-white/20'
                    )}
                  >
                    <span>{isPreviewing ? t('building.blueprints.previewing', { defaultValue: 'Previewing' }) : t('building.blueprints.preview', { defaultValue: 'Preview' })}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onApplyToSandbox(blueprint)
                      onClose()
                    }}
                    className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-raised)] py-1.5 text-[11px] font-bold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    <Hammer size={12} aria-hidden="true" />
                    <span>{t('building.blueprints.useTemplate', { defaultValue: 'Load to Sandbox' })}</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
