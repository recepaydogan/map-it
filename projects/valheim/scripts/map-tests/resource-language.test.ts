import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { prepareGameLocalization } from '../../src/lib/valheim/game-localization.ts'
import { isResourceFilterMaterial } from '../../src/lib/valheim/resource-selection.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const readGameData = (file: string) => JSON.parse(readFileSync(path.join(root, 'public/game-data', file), 'utf8'))

test('all selectable saved-world resource labels resolve to Chinese display names', () => {
  const localization = prepareGameLocalization(readGameData('localization.json'), 'zh-Hans')
  const items = readGameData('marker-intelligence.json').items as Record<string, { name: string }>
  const itemNodes = readGameData('planner-catalog.json').itemNodes as Record<string, string[]>

  const untranslated = Object.keys(itemNodes)
    .filter(isResourceFilterMaterial)
    .map((prefab) => ({ prefab, name: localization.translateText(items[prefab]?.name ?? prefab) }))
    .filter(({ name }) => !/[\u3400-\u9fff]/u.test(name))

  assert.deepEqual(untranslated, [])
  assert.equal(localization.translateText('Upgrader4Armor'), '黑金属防护神像')
  assert.equal(localization.translateText('Upgrader5Weapon'), '黑大理石战斗神像')
  assert.equal(localization.translateText('Upgrader6Armor'), '焰金属防护神像')
  assert.equal(localization.translateText('Ancient Seed'), '上古种子')
})

test('the extracted item catalog has no raw prefab ids in Chinese mode', () => {
  const localization = prepareGameLocalization(readGameData('localization.json'), 'zh-Hans')
  const items = readGameData('marker-intelligence.json').items as Record<string, { name: string }>
  const untranslated = Object.entries(items)
    .map(([prefab, item]) => ({ prefab, name: localization.translateText(item.name || prefab) }))
    .filter(({ name }) => !/[\u3400-\u9fff]/u.test(name))
  assert.deepEqual(untranslated, [])
  assert.equal(localization.translateText('Upgrader0Weapon'), '木制战斗神像')
  assert.equal(localization.translateText('Upgrader7Armor'), '血金防护神像')
  assert.equal(localization.translateText('TrophyDeerWhite'), '白鹿战利品')
})

test('Brazilian Portuguese uses the official Valheim names and resolves catalog-only prefab ids', () => {
  const payload = readGameData('localization.json')
  const localization = prepareGameLocalization(payload, 'pt-BR')
  const items = readGameData('marker-intelligence.json').items as Record<string, { name: string }>
  const english = payload.english as Record<string, string>
  const portuguese = payload.translations.Portuguese_Brazilian as Record<string, string>
  const officialNames = new Set(Object.entries(english).filter(([token]) => portuguese[token]).map(([, name]) => name))
  const rawPrefabIds = Object.values(items)
    .filter(({ name }) => !officialNames.has(name))
    .map(({ name }) => ({ prefab: name, translated: localization.translateText(name) }))
    .filter(({ prefab, translated }) => prefab === translated)
  assert.deepEqual(rawPrefabIds, [])
  const needsTranslation = new Set(Object.entries(english)
    .filter(([token, name]) => portuguese[token] && portuguese[token] !== name)
    .map(([, name]) => name))
  const untranslatedCatalogNames = Object.values(items)
    .map(({ name }) => name)
    .filter((name) => needsTranslation.has(name) && localization.translateText(name) === name)
  assert.deepEqual(untranslatedCatalogNames, [])
  assert.equal(localization.translateText('Carrot'), 'Cenoura')
  assert.equal(localization.translateText('Black Marble'), 'Mármore preto')
  assert.equal(localization.translateText('Black Metal'), 'Metal negro')
  assert.equal(localization.translateText('Upgrader4Armor'), 'Ídolo de proteção de metal negro')
  assert.equal(localization.translateText('SeekerBrood'), portuguese.enemy_babyseeker)
})
