export const combatDamageTypes = [
  'blunt',
  'slash',
  'pierce',
  'fire',
  'frost',
  'lightning',
  'poison',
  'spirit',
]

export const damageModifierPresentation = {
  1: { label: 'map.resistant', tone: 'text-amber-200 border-amber-400/25 bg-amber-400/10' },
  2: { label: 'map.weak', tone: 'text-emerald-200 border-emerald-400/25 bg-emerald-400/10' },
  3: { label: 'map.immune', tone: 'text-slate-200 border-slate-300/20 bg-slate-300/10' },
  5: { label: 'map.veryResistant', tone: 'text-orange-200 border-orange-400/25 bg-orange-400/10' },
  6: { label: 'map.veryWeak', tone: 'text-green-200 border-green-400/25 bg-green-400/10' },
} as const
