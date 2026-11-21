import {
  Anvil,
  ChevronLeft,
  ChevronRight,
  Grid3x3,
  Hammer,
  Home,
  Layers,
  MoveHorizontal,
  Mountain,
  MountainSnow,
  Palette,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { LESSONS, type LessonDefinition } from '../lessons.ts'

const ICONS: Record<LessonDefinition['icon'], ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean | 'true' }>> = {
  palette: Palette,
  layers: Layers,
  'move-horizontal': MoveHorizontal,
  bridge: Sparkles,
  grid: Grid3x3,
  'mountain-snow': MountainSnow,
  mountain: Mountain,
  anvil: Anvil,
  home: Home,
}

interface LessonStripProps {
  activeLessonId: string | null
  onLesson: (id: string) => void
  onSandbox: () => void
  onReset: () => void
}

export function LessonStrip({ activeLessonId, onLesson, onSandbox, onReset }: LessonStripProps) {
  const { t } = useTranslation()
  const active = LESSONS.find((lesson) => lesson.id === activeLessonId) ?? LESSONS[0]
  const index = LESSONS.indexOf(active)

  const handlePrev = () => {
    const prev = LESSONS[(index - 1 + LESSONS.length) % LESSONS.length]
    onLesson(prev.id)
  }

  const handleNext = () => {
    const next = LESSONS[(index + 1) % LESSONS.length]
    onLesson(next.id)
  }

  return (
    <div className="pointer-events-none flex flex-col items-center gap-2">
      {/* Active Lesson Card */}
      <div className="pointer-events-auto flex w-[min(740px,calc(100vw-2rem))] items-center gap-3 rounded-[var(--radius-md)] border border-[var(--accent)]/40 bg-black/85 px-4 py-3 shadow-2xl backdrop-blur-2xl">
        <button
          type="button"
          onClick={handlePrev}
          title={t('common.previous', { defaultValue: 'Previous Lesson' })}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] border border-white/10 bg-white/5 text-[var(--muted)] hover:bg-white/15 hover:text-[var(--text)]"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>

        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent-text)]">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--accent-text)]">
              {t(`building.lessons.${active.id}.title`)}
            </span>
            <span className="text-[10px] text-[var(--muted)]">({index + 1}/{LESSONS.length})</span>
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-[var(--text)]">
            {t(`building.lessons.${active.id}.caption`)}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">
            <span className="font-bold text-[var(--accent-text)]">{t('building.lessonCard.try', { defaultValue: 'Try:' })} </span>
            {t(`building.lessons.${active.id}.try`)}
          </p>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] border border-white/10 bg-white/5 text-[var(--muted)] hover:bg-white/15 hover:text-[var(--text)]"
          title={t('building.lessonCard.reset', { defaultValue: 'Reset Lesson' })}
        >
          <RotateCcw size={14} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={handleNext}
          title={t('common.next', { defaultValue: 'Next Lesson' })}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] border border-white/10 bg-white/5 text-[var(--muted)] hover:bg-white/15 hover:text-[var(--text)]"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Lesson Selector Chips */}
      <div className="pointer-events-auto flex items-center gap-1 overflow-x-auto rounded-[var(--radius-md)] border border-white/10 bg-black/75 p-1 shadow-xl backdrop-blur-xl">
        {LESSONS.map((lesson, lessonIndex) => {
          const Icon = ICONS[lesson.icon]
          const isActive = lesson.id === activeLessonId
          return (
            <button
              key={lesson.id}
              type="button"
              onClick={() => onLesson(lesson.id)}
              aria-current={isActive ? 'true' : undefined}
              title={t(`building.lessons.${lesson.id}.title`)}
              className={cn(
                'flex h-11 w-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--radius-sm)] px-1 transition-colors',
                isActive
                  ? 'bg-[var(--surface-hover)] text-[var(--accent-text)] font-bold'
                  : 'text-[var(--muted)] hover:bg-white/10 hover:text-[var(--text)]'
              )}
            >
              <Icon size={14} aria-hidden="true" />
              <span className="max-w-full truncate text-[9.5px] font-semibold leading-none">
                {lessonIndex + 1}. {t(`building.lessons.${lesson.id}.short`)}
              </span>
            </button>
          )
        })}

        <span className="mx-0.5 h-6 w-px bg-white/10" />

        <button
          type="button"
          onClick={onSandbox}
          title={t('building.rail.sandbox', { defaultValue: 'Return to Sandbox' })}
          className="flex h-11 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-[10.5px] font-bold text-[var(--accent-text)] hover:bg-white/10"
        >
          <Hammer size={13} aria-hidden="true" />
          <span>{t('building.rail.sandbox', { defaultValue: 'Sandbox' })}</span>
        </button>
      </div>
    </div>
  )
}

