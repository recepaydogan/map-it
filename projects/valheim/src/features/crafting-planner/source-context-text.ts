import type { TFunction } from 'i18next'
import type { PlannerMapSourceContext } from '../../store/planner-map-source-store.ts'

const TOOL_TIER_KEYS = ['any', 'bronze', 'iron', 'blackmetal', 'flametal'] as const

/**
 * One sentence for the map banner and the hero hint: what to do, on what, what
 * drops, with what tool, and how many confirmed spots the save shows.
 * Pure so it can be unit-tested with a stub `t`.
 */
export function describeSourceContext(t: TFunction, context: PlannerMapSourceContext): string {
  const parts: string[] = []
  const tool = context.minToolTier && context.minToolTier > 0
    ? t(`planner.mapMode.tool.${TOOL_TIER_KEYS[Math.min(context.minToolTier, TOOL_TIER_KEYS.length - 1)]}`)
    : ''
  parts.push(t(`planner.mapMode.action.${context.action}`, { subject: context.subject, tool }).trim())

  if (context.amountMin !== undefined && context.amountMax !== undefined) {
    const amount = context.amountMin === context.amountMax
      ? String(context.amountMin)
      : `${context.amountMin}–${context.amountMax}`
    const chance = context.chance !== undefined && context.chance < 1
      ? t('planner.mapMode.dropChance', { chance: Math.round(context.chance * 100) })
      : ''
    parts.push(t('planner.mapMode.drops', { amount, item: context.itemName, chance }).trim())
  } else if (context.action !== 'fish') {
    parts.push(t('planner.mapMode.dropsItem', { item: context.itemName }))
  }

  if (context.confirmedCount !== undefined && context.confirmedCount > 0) {
    parts.push(context.action === 'loot'
      ? t('planner.mapMode.spotsInside', { count: context.confirmedCount })
      : t('planner.mapMode.confirmedSpots', { count: context.confirmedCount }))
  }
  return parts.filter(Boolean).join(' · ')
}
