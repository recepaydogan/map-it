import {
  ChevronLeft,
  ChevronRight,
  Ear,
  Footprints,
  HeartPulse,
  PackageOpen,
  PawPrint,
  Shield,
  Skull,
  Sparkles,
  Users,
  Waves,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGameLocalization } from '../hooks/use-localization-table'
import { cn } from '../lib/cn'
import { formatGameName } from '../lib/location-presentation'
import type { CharacterIntel, MarkerItemIntel } from '../types/marker-intelligence'
import { DamageProfile } from './damage-profile'

interface CharacterDetailPanelProps {
  backLabel?: string
  character: CharacterIntel
  leftOffset: number
  onBack?: () => void
  onClose: () => void
  onSelectItem: (item: MarkerItemIntel) => void
  selectedItem?: string | null
  topOffset: number
}

const dropAmount = (item: MarkerItemIntel) => {
  const minimum = item.amountMin ?? 1
  const maximum = item.amountMax ?? minimum
  return minimum === maximum ? `×${minimum}` : `×${minimum}–${maximum}`
}

export function CharacterDetailPanel({
  backLabel,
  character,
  leftOffset,
  onBack,
  onClose,
  onSelectItem,
  selectedItem,
  topOffset,
}: CharacterDetailPanelProps) {
  const { i18n, t } = useTranslation()
  const gameLocalization = useGameLocalization()
  const PortraitFallbackIcon = character.boss ? Skull : PawPrint
  const number = (value: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(value)
  const facts = [
    character.health == null ? null : { icon: HeartPulse, label: t('character.health'), value: number(character.health) },
    character.walkSpeed == null ? null : { icon: Footprints, label: t('character.walkSpeed'), value: t('character.metersPerSecond', { value: number(character.walkSpeed) }) },
    character.runSpeed == null ? null : { icon: Footprints, label: t('character.runSpeed'), value: t('character.metersPerSecond', { value: number(character.runSpeed) }) },
    character.alertRange == null ? null : { icon: Ear, label: t('character.alertRange'), value: t('character.meters', { value: number(character.alertRange) }) },
    character.viewRange == null ? null : { icon: Users, label: t('character.viewRange'), value: t('character.meters', { value: number(character.viewRange) }) },
  ].filter((fact): fact is NonNullable<typeof fact> => fact !== null)

  return (
    <aside
      className="pointer-events-auto absolute z-[26] flex w-[360px] max-w-[calc(100%-4rem)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--overlay-background)] shadow-2xl shadow-black/60 backdrop-blur-xl"
      style={{ left: leftOffset, top: topOffset, maxHeight: `calc(100% - ${topOffset + 8}px)` }}
      aria-label={t('character.detailsPanel', { name: character.name })}
    >
      {onBack && backLabel ? (
        <button
          type="button"
          onClick={onBack}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 border-b border-[var(--border)] px-4 py-2.5 text-[11px] font-medium text-[var(--text)]/80 transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          {t('item.backTo', { name: backLabel })}
        </button>
      ) : null}
      <header className="relative shrink-0 overflow-hidden border-b border-[var(--border)] p-5">
        <div className="relative flex items-center gap-4 pr-8">
          <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-black/30 text-[var(--accent-text)] shadow-inner">
            {character.portrait ? (
              <img src={character.portrait} alt="" className="size-full object-contain p-1" aria-hidden="true" />
            ) : (
              <PortraitFallbackIcon size={30} strokeWidth={1.8} aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-text)]">
              {t(character.boss ? 'character.boss' : 'character.creature')}
            </p>
            <h2 className="mt-1 font-[var(--font-display)] text-[20px] font-semibold leading-tight text-[var(--text)]">
              {character.name}
            </h2>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              {t(`character.factions.${character.faction}`, { defaultValue: formatGameName(character.faction) })}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 grid size-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          aria-label={t('character.closeDetails')}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {facts.length ? (
          <dl className="grid grid-cols-2 gap-1.5">
            {facts.map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-[var(--radius-sm)] bg-white/[0.045] px-3 py-2.5 first:col-span-2">
                <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                  <Icon size={11} aria-hidden="true" />{label}
                </dt>
                <dd className="mt-1 text-[14px] font-semibold tabular-nums text-[var(--text)]">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <section className="mt-5">
          <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            <Shield size={13} aria-hidden="true" />{t('character.combatProfile')}
          </h3>
          <DamageProfile modifiers={character.damageModifiers} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {character.canSwim ? (
              <span className="inline-flex items-center gap-1 rounded-[var(--radius-full)] border border-[var(--border)] bg-white/[0.03] px-2.5 py-1 text-[10px] text-[var(--text)]">
                <Waves size={10} aria-hidden="true" />{t('character.canSwim')}
              </span>
            ) : null}
            {character.staggerWhenBlocked ? (
              <span className="inline-flex items-center gap-1 rounded-[var(--radius-full)] border border-[var(--border)] bg-white/[0.03] px-2.5 py-1 text-[10px] text-[var(--text)]">
                <Sparkles size={10} aria-hidden="true" />{t('character.staggerWhenBlocked')}
              </span>
            ) : null}
          </div>
        </section>

        {character.equipment.length ? (
          <section className="mt-5 border-t border-[var(--border)] pt-4">
            <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              {t('character.possibleEquipment')}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {character.equipment.map((equipment) => (
                <span key={equipment} className="rounded-[var(--radius-full)] border border-[var(--border)] bg-white/[0.03] px-2.5 py-1 text-[10px] text-[var(--text)]">
                  {gameLocalization?.translateText(formatGameName(equipment)) ?? formatGameName(equipment)}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {(character.encounterDrops ?? character.drops).length ? (
          <section className="mt-5 border-t border-[var(--border)] pt-4">
            <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              <PackageOpen size={13} aria-hidden="true" />{t('character.drops')}
            </h3>
            <div className="space-y-1.5">
              {(character.encounterDrops ?? character.drops).map((drop, index) => (
                <button
                  key={`${drop.prefabName}:${index}`}
                  type="button"
                  onClick={() => onSelectItem(drop)}
                  aria-pressed={selectedItem === drop.prefabName}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-2.5 text-left transition-colors',
                    selectedItem === drop.prefabName
                      ? 'border-[var(--accent)] bg-transparent'
                      : 'border-transparent bg-white/[0.04] hover:bg-white/[0.07]',
                  )}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-black/25">
                    {drop.icon ? <img src={drop.icon} alt="" className="size-8 object-contain" /> : <PackageOpen size={16} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-[var(--text)]">{drop.name}</span>
                    <span className="mt-0.5 block text-[10px] text-[var(--muted)]">
                      {drop.chance === 1
                        ? t('map.guaranteedDrop')
                        : t('map.dropChance', { chance: number((drop.chance ?? 0) * 100) })}
                    </span>
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--accent-text)]">{dropAmount(drop)}</span>
                  <ChevronRight size={14} className="text-[var(--muted)]" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  )
}
