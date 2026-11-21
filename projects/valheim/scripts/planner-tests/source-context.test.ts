import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TFunction } from 'i18next'
import { describeSourceContext } from '../../src/features/crafting-planner/source-context-text.ts'
import { actionForNodeKind, nodeDisplayName } from '../../src/features/crafting-planner/source-context.ts'

// A stub `t` that renders the English strings the way i18next would.
const en: Record<string, string> = {
  'planner.mapMode.action.mine': 'Mine {{subject}} {{tool}}',
  'planner.mapMode.action.chop': 'Chop {{subject}} {{tool}}',
  'planner.mapMode.action.hunt': 'Hunt {{subject}}',
  'planner.mapMode.action.loot': 'Loot {{subject}}',
  'planner.mapMode.tool.bronze': '(bronze pickaxe or better)',
  'planner.mapMode.tool.iron': '(iron pickaxe or better)',
  'planner.mapMode.drops': 'drops {{amount}} {{item}} {{chance}}',
  'planner.mapMode.dropsItem': 'drops {{item}}',
  'planner.mapMode.dropChance': '({{chance}}% chance)',
  'planner.mapMode.confirmedSpots': '{{count}} confirmed spots',
  'planner.mapMode.spotsInside': '{{count}} spots inside',
}
const t = ((key: string, options?: Record<string, unknown>) =>
  (en[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name) => String(options?.[name] ?? ''))) as unknown as TFunction

test('banner sentence for a confirmed deposit', () => {
  const text = describeSourceContext(t, {
    action: 'mine', subject: 'Silvervein', itemName: 'Silver', amountMin: 1, amountMax: 3, chance: 1, minToolTier: 2, confirmedCount: 12,
  })
  assert.equal(text, 'Mine Silvervein (iron pickaxe or better) · drops 1–3 Silver · 12 confirmed spots')
})

test('banner sentence for a creature drop with chance', () => {
  const text = describeSourceContext(t, {
    action: 'hunt', subject: 'Greydwarf', itemName: 'Resin', amountMin: 1, amountMax: 1, chance: 0.5,
  })
  assert.equal(text, 'Hunt Greydwarf · drops 1 Resin (50% chance)')
})

test('banner sentence for a location without confirmed points', () => {
  assert.equal(
    describeSourceContext(t, { action: 'loot', subject: 'Sunken Crypt', itemName: 'Iron Scrap', confirmedCount: 6 }),
    'Loot Sunken Crypt · drops Iron Scrap · 6 spots inside',
  )
})

test('node kinds map to actions and readable names', () => {
  assert.equal(actionForNodeKind('mine-rock'), 'mine')
  assert.equal(actionForNodeKind('tree'), 'chop')
  assert.equal(actionForNodeKind('pickable'), 'pick')
  assert.equal(nodeDisplayName('rock4_copper_frac'), 'Copper')
  assert.equal(nodeDisplayName('RaspberryBush'), 'Raspberry bush')
  assert.equal(nodeDisplayName('MineRock_Tin'), 'Tin')
})
