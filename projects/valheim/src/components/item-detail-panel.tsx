import {
  Anvil,
  ChevronLeft,
  Coins,
  Footprints,
  Gauge,
  HeartPulse,
  Layers3,
  PackageOpen,
  Shield,
  Sparkles,
  Swords,
  Weight,
  Wrench,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { damageModifierPresentation } from '../lib/damage-modifier-presentation'
import type { MarkerItemIntel } from '../types/marker-intelligence'
import { ItemDetailContextSections } from './item-detail-context-sections'

interface ItemDetailPanelProps {
  backLabel?: string
  item: MarkerItemIntel
  items?: Record<string, MarkerItemIntel>
  leftOffset: number
  onBack?: () => void
  onClose: () => void
  onSelectItem?: (item: MarkerItemIntel) => void
  topOffset: number
}

const damageTypes = ['blunt', 'slash', 'pierce', 'chop', 'pickaxe', 'fire', 'frost', 'lightning', 'poison', 'spirit']

export function ItemDetailPanel({ backLabel, item, items, leftOffset, onBack, onClose, onSelectItem, topOffset }: ItemDetailPanelProps) {
  const { i18n, t } = useTranslation()
  const number = (value: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(value)
  const weaponTypes = new Set(['oneHandedWeapon', 'twoHandedWeapon', 'bow', 'polearm', 'torch', 'tool', 'ammo'])
  const armorTypes = new Set(['helmet', 'chestArmor', 'legArmor', 'handArmor', 'shoulderArmor'])
  const showWeaponStats = weaponTypes.has(item.type ?? '')
  const showArmorStats = armorTypes.has(item.type ?? '')
  const showBlockStats = item.type === 'shield' || showWeaponStats
  const showDurability = showWeaponStats || showArmorStats || item.type === 'shield'
  const damageRows = !showWeaponStats ? [] : damageTypes.flatMap((type) => {
    const value = item.damages?.[type] ?? 0
    const perLevel = item.damagesPerLevel?.[type] ?? 0
    return value > 0 ? [{ type, value, perLevel }] : []
  })
  const facts = [
    item.weight != null ? { icon: Weight, label: t('item.weight'), value: number(item.weight) } : null,
    item.maxStack != null ? { icon: Layers3, label: t('item.maxStack'), value: number(item.maxStack) } : null,
    item.value ? { icon: Coins, label: t('item.value'), value: number(item.value) } : null,
    item.maxQuality && item.maxQuality > 1
      ? { icon: Anvil, label: t('item.maxQuality'), value: number(item.maxQuality) }
      : null,
  ].filter((fact): fact is NonNullable<typeof fact> => fact !== null)
  const foodFacts = [
    item.food ? [t('item.health'), number(item.food)] : null,
    item.foodStamina ? [t('item.stamina'), number(item.foodStamina)] : null,
    item.foodEitr ? [t('item.eitr'), number(item.foodEitr)] : null,
    item.foodRegen ? [t('item.healing'), t('item.perTick', { value: number(item.foodRegen) })] : null,
    item.foodDurationSeconds
      ? [t('item.duration'), t('item.minutesShort', { value: Math.round(item.foodDurationSeconds / 60) })]
      : null,
  ].filter((fact): fact is string[] => fact !== null)
  const weaponFacts = [
    item.attackForce ? [t('item.attackForce'), number(item.attackForce)] : null,
    item.backstabBonus && item.backstabBonus !== 1
      ? [t('item.backstab'), t('item.multiplier', { value: number(item.backstabBonus) })]
      : null,
    item.primaryAttackStamina ? [t('item.primaryStamina'), number(item.primaryAttackStamina)] : null,
    item.secondaryAttackStamina ? [t('item.secondaryStamina'), number(item.secondaryAttackStamina)] : null,
    item.primaryAttackEitr ? [t('item.primaryEitr'), number(item.primaryAttackEitr)] : null,
    item.secondaryAttackEitr ? [t('item.secondaryEitr'), number(item.secondaryAttackEitr)] : null,
    item.toolTier ? [t('item.toolTier'), number(item.toolTier)] : null,
  ].filter((fact): fact is string[] => fact !== null)
  const defenseFacts = [
    showArmorStats && item.armor
      ? [t('item.armor'), number(item.armor), item.armorPerLevel]
      : null,
    showBlockStats && item.blockPower
      ? [t('item.blockPower'), number(item.blockPower), item.blockPowerPerLevel]
      : null,
    showBlockStats && item.deflectionForce
      ? [t('item.deflectionForce'), number(item.deflectionForce), item.deflectionForcePerLevel]
      : null,
    showBlockStats && item.timedBlockBonus
      ? [t('item.parryBonus'), t('item.multiplier', { value: number(item.timedBlockBonus) }), null]
      : null,
  ].filter((fact): fact is [string, string, number | null | undefined] => fact !== null)
  const propertyFacts = [
    item.teleportable == null
      ? null
      : { icon: Gauge, label: item.teleportable ? t('item.teleportable') : t('item.notTeleportable') },
    item.displayable ? { icon: PackageOpen, label: t('item.displayable') } : null,
    item.questItem ? { icon: Sparkles, label: t('item.questItem') } : null,
    showDurability && item.useDurability && item.maxDurability
      ? { icon: Wrench, label: t('item.durabilityWithUpgrade', {
          value: number(item.maxDurability),
          perLevel: number(item.durabilityPerLevel ?? 0),
        }) }
      : null,
    showDurability && item.repairable ? { icon: Wrench, label: t('item.repairable') } : null,
    item.movementModifier
      ? { icon: Footprints, label: t('item.movementModifier', { value: number(item.movementModifier * 100) }) }
      : null,
    item.eitrRegenModifier
      ? { icon: Sparkles, label: t('item.eitrRegenModifier', { value: number(item.eitrRegenModifier * 100) }) }
      : null,
  ].filter((fact): fact is NonNullable<typeof fact> => fact !== null)

  return (
    <aside
      className="pointer-events-auto absolute z-[26] flex w-[360px] max-w-[calc(100%-4rem)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--overlay-background)] shadow-2xl shadow-black/60 backdrop-blur-xl"
      style={{ left: leftOffset, top: topOffset, maxHeight: `calc(100% - ${topOffset + 8}px)` }}
      aria-label={t('item.detailsPanel', { item: item.name })}
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
      <header className="relative shrink-0 overflow-hidden border-b border-[var(--border)] p-4">
        <div className="relative flex items-center gap-3 pr-8">
          <span className="grid size-14 shrink-0 place-items-center rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-black/30 shadow-inner">
            {item.icon ? <img src={item.icon} alt="" className="size-12 object-contain" /> : <PackageOpen size={24} aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-text)]">
              {t(`item.types.${item.type ?? 'unknown'}`)}
            </p>
            <h2 className="mt-0.5 font-[var(--font-display)] text-[18px] font-semibold leading-tight text-[var(--text)]">{item.name}</h2>
          </div>
        </div>
        <button type="button" onClick={onClose} className="absolute right-3 top-3 grid size-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]" aria-label={t('item.closeDetails')}>
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {facts.length ? (
          <dl className="grid grid-cols-2 gap-1.5">
            {facts.map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-[var(--radius-sm)] bg-white/[0.045] px-3 py-2.5">
                <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[var(--muted)]"><Icon size={11} aria-hidden="true" />{label}</dt>
                <dd className="mt-1 text-[14px] font-semibold tabular-nums text-[var(--text)]">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {item.description ? (
          <blockquote className="mt-4 whitespace-pre-line border-l-2 border-[var(--accent)]/45 pl-3.5 text-[12px] leading-relaxed text-[var(--text)]/85">
            {item.description}
          </blockquote>
        ) : null}

        {damageRows.length ? (
          <section className="mt-5">
            <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]"><Swords size={13} aria-hidden="true" />{t('item.damage')}</h3>
            <dl className="space-y-1">
              {damageRows.map(({ type, value, perLevel }) => (
                <div key={type} className="flex items-center justify-between rounded-[var(--radius-sm)] bg-white/[0.04] px-3 py-2 text-[12px]"><dt className="text-[var(--muted)]">{t(`map.damageTypes.${type}`)}</dt><dd className="font-semibold tabular-nums text-[var(--text)]">{number(value)}{perLevel ? <span className="ml-1 font-normal text-[var(--muted)]">{t('item.perLevel', { value: number(perLevel) })}</span> : null}</dd></div>
              ))}
            </dl>
            {weaponFacts.length ? (
              <dl className="mt-1.5 grid grid-cols-2 gap-1.5">
                {weaponFacts.map(([label, value]) => <div key={label} className="rounded-[var(--radius-sm)] bg-white/[0.04] px-3 py-2"><dt className="text-[10px] text-[var(--muted)]">{label}</dt><dd className="mt-1 text-[12px] font-semibold text-[var(--text)]">{value}</dd></div>)}
              </dl>
            ) : null}
          </section>
        ) : null}

        {defenseFacts.length ? (
          <section className="mt-5">
            <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]"><Shield size={13} aria-hidden="true" />{t('item.defense')}</h3>
            <dl className="grid grid-cols-2 gap-1.5">
              {defenseFacts.map(([label, value, perLevel]) => <div key={label} className="rounded-[var(--radius-sm)] bg-white/[0.04] px-3 py-2"><dt className="text-[10px] text-[var(--muted)]">{label}</dt><dd className="mt-1 font-semibold text-[var(--text)]">{value}{perLevel ? <span className="ml-1 text-[10px] font-normal text-[var(--muted)]">{t('item.perLevel', { value: number(perLevel) })}</span> : null}</dd></div>)}
            </dl>
            {item.equipmentDamageModifiers?.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {item.equipmentDamageModifiers.map(({ type, modifier }) => {
                  const presentation = damageModifierPresentation[modifier as keyof typeof damageModifierPresentation]
                  return presentation ? <span key={type} className={cn('rounded-[var(--radius-full)] border px-2.5 py-1 text-[10px] font-semibold', presentation.tone)}>{t(`map.damageTypes.${type}`)} · {t(presentation.label)}</span> : null
                })}
              </div>
            ) : null}
          </section>
        ) : null}

        {item.type === 'consumable' && foodFacts.length ? (
          <section className="mt-5">
            <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]"><HeartPulse size={13} aria-hidden="true" />{t('item.foodEffects')}</h3>
            <dl className="grid grid-cols-2 gap-1.5">{foodFacts.map(([label, value]) => <div key={label} className="rounded-[var(--radius-sm)] bg-white/[0.04] px-3 py-2"><dt className="text-[10px] text-[var(--muted)]">{label}</dt><dd className="mt-1 font-semibold text-[var(--text)]">{value}</dd></div>)}</dl>
          </section>
        ) : null}

        <ItemDetailContextSections item={item} items={items} onSelectItem={onSelectItem} />

        {propertyFacts.length ? <section className="mt-5 border-t border-[var(--border)] pt-4">
          <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]"><Sparkles size={13} aria-hidden="true" />{t('item.properties')}</h3>
          <div className="flex flex-wrap gap-1.5">
            {propertyFacts.map(({ icon: Icon, label }) => <span key={label} className="inline-flex items-center gap-1 rounded-[var(--radius-full)] border border-[var(--border)] bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-[var(--text)]"><Icon size={10} aria-hidden="true" />{label}</span>)}
          </div>
        </section> : null}
      </div>
    </aside>
  )
}
