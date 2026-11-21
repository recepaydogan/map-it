import { Trans, useTranslation } from 'react-i18next'
import { combatDamageTypes } from '../lib/damage-modifier-presentation'

interface DamageProfileProps {
  modifiers: Record<string, number>
}

const damageTypeColor: Record<string, string> = {
  blunt: '#8dd8c0',
  slash: '#e3c46f',
  pierce: '#e0a468',
  fire: '#ee8c69',
  frost: '#76c8df',
  lightning: '#dbc974',
  poison: '#b4ce72',
  spirit: '#c5a6e8',
}

const modifierPercent: Record<number, number> = {
  1: 50,
  2: 50,
  5: 75,
  6: 100,
  7: 25,
  8: 25,
}

function DamageTypeList({ types }: { types: string[] }) {
  const { t } = useTranslation()
  return (
    <>
      {types.map((type, index) => (
        <span key={type}>
          <span className="font-semibold" style={{ color: damageTypeColor[type] }}>
            {t(`map.damageTypes.${type}`)}
          </span>
          {index < types.length - 2 ? ', ' : index === types.length - 2 ? ` ${t('common.and')} ` : ''}
        </span>
      ))}
    </>
  )
}

export function DamageProfile({ modifiers }: DamageProfileProps) {
  const { t } = useTranslation()
  const groups = new Map<number, string[]>()
  for (const damageType of combatDamageTypes) {
    const modifier = modifiers[damageType]
    if (![1, 2, 3, 5, 6, 7, 8].includes(modifier)) continue
    groups.set(modifier, [...(groups.get(modifier) ?? []), damageType])
  }

  if (!groups.size) {
    return <p className="text-[12px] leading-relaxed text-[var(--muted)]">{t('map.noSpecialDefenses')}</p>
  }

  return (
    <div className="space-y-1.5">
      {[...groups.entries()].map(([modifier, types]) => {
        const list = <DamageTypeList types={types} />
        const key = modifier === 3
          ? 'map.damageSentenceImmune'
          : [2, 6, 8].includes(modifier)
            ? 'map.damageSentenceWeak'
            : 'map.damageSentenceResistant'
        return (
          <p key={modifier} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-white/[0.025] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--muted)]">
            <Trans i18nKey={key} values={{ percent: modifierPercent[modifier] }} components={{ list }} />
          </p>
        )
      })}
    </div>
  )
}
