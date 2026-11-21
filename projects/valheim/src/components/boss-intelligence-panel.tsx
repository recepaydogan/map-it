import {
  Clock3,
  HeartPulse,
  PackageOpen,
  Shield,
  Sparkles,
  Swords,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import type {
  BossPowerIntel,
  CharacterIntel,
  MarkerItemIntel,
} from '../types/marker-intelligence'
import { DamageProfile } from './damage-profile'

interface BossIntelligencePanelProps {
  boss: CharacterIntel
  offering?: MarkerItemIntel
  power?: BossPowerIntel
  selectedItem?: string | null
  onSelectItem: (item: MarkerItemIntel) => void
}

const formatSeconds = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder ? `${minutes}:${String(remainder).padStart(2, '0')}` : `${minutes}m`
}

const amountLabel = (item: MarkerItemIntel) => {
  const minimum = item.amountMin ?? 1
  const maximum = item.amountMax ?? minimum
  return minimum === maximum ? `×${minimum}` : `×${minimum}–${maximum}`
}

export function BossIntelligencePanel({
  boss,
  offering,
  power,
  selectedItem,
  onSelectItem,
}: BossIntelligencePanelProps) {
  const { i18n, t } = useTranslation()
  const formatNumber = (value: number) => new Intl.NumberFormat(i18n.language).format(value)
  return (
    <>
      <section className="border-t border-[var(--border)] px-4 py-3.5">
        <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          <Swords size={13} aria-hidden="true" />
          {t('map.bossCombat')}
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-[var(--radius-sm)] bg-white/[0.045] px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
              <HeartPulse size={12} aria-hidden="true" />
              {t('map.health')}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text)]">
              {boss.health === null ? t('common.notAvailable') : formatNumber(boss.health)}
            </p>
          </div>
          <button
            type="button"
            disabled={!offering}
            onClick={() => offering && onSelectItem(offering)}
            aria-pressed={offering ? selectedItem === offering.prefabName : undefined}
            className={cn(
              'rounded-[var(--radius-sm)] border px-3 py-2.5 text-left transition-colors',
              offering && selectedItem === offering.prefabName
                ? 'border-[var(--accent)] bg-transparent'
                : offering
                  ? 'cursor-pointer border-transparent bg-white/[0.045] hover:bg-white/[0.07]'
                  : 'cursor-default border-transparent bg-white/[0.045]',
            )}
          >
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
              <Shield size={12} aria-hidden="true" />
              {t('map.summonOffering')}
            </p>
            <p className="mt-1 truncate text-[13px] font-semibold text-[var(--text)]">
              {offering ? `${offering.count}× ${offering.name}` : t('common.notAvailable')}
            </p>
          </button>
        </div>

        <div className="mt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {t('map.damageProfile')}
          </p>
          <DamageProfile modifiers={boss.damageModifiers} />
        </div>
      </section>

      <section className="border-t border-[var(--border)] px-4 py-3.5">
        <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          <PackageOpen size={13} aria-hidden="true" />
          {t('map.bossDrops')}
        </h3>
        <div className="space-y-1.5">
          {(boss.encounterDrops ?? boss.drops).map((drop, index) => (
            <button
              type="button"
              key={`${drop.prefabName}:${index}`}
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
                {drop.icon ? <img src={drop.icon} alt="" className="size-7 object-contain" /> : <PackageOpen size={16} aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[var(--text)]">{drop.name}</p>
                <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                  {drop.chance === 1
                    ? t('map.guaranteedDrop')
                    : t('map.dropChance', { chance: Math.round((drop.chance ?? 0) * 100) })}
                  {drop.onePerPlayer ? ` · ${t('map.onePerPlayer')}` : ''}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--accent-text)]">{amountLabel(drop)}</span>
            </button>
          ))}
        </div>
      </section>

      {power ? (
        <section className="border-t border-[var(--border)] px-4 py-3.5">
          <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            <Sparkles size={13} aria-hidden="true" />
            {t('map.forsakenPower')}
          </h3>
          <div className="rounded-[var(--radius-md)] border border-[var(--accent)]/20 bg-[var(--accent)]/[0.07] p-3">
            <p className="text-[13px] font-semibold text-[var(--text)]">{power.name}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--muted)]">{power.description}</p>
            <div className="mt-2.5 flex gap-3 text-[10px] font-medium text-[var(--muted)]">
              {power.durationSeconds ? (
                <span className="flex items-center gap-1"><Clock3 size={11} aria-hidden="true" />{t('map.powerDuration', { duration: formatSeconds(power.durationSeconds) })}</span>
              ) : null}
              {power.cooldownSeconds ? (
                <span>{t('map.powerCooldown', { cooldown: formatSeconds(power.cooldownSeconds) })}</span>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </>
  )
}
