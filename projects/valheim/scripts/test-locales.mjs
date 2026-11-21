import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import i18next from 'i18next'

const root = path.resolve(import.meta.dirname, '..')
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'src', 'i18n', 'locales', name), 'utf8'))
const en = read('en.json')
const ru = read('ru.json')
const zh = read('zh-Hans.json')
const ptBR = read('pt-BR.json')
const placeholders = (value) => [...value.matchAll(/\{\{[^{}]+\}\}|<list\/>/g)].map(([match]) => match).sort()

const check = (source, translated, trail = '') => {
  if (Array.isArray(source)) {
    assert.ok(Array.isArray(translated), `${trail} must remain an array`)
    assert.equal(translated.length, source.length, `${trail} array length changed`)
    source.forEach((entry, index) => check(entry, translated[index], `${trail}.${index}`))
    return
  }
  if (source !== null && typeof source === 'object') {
    assert.ok(translated !== null && typeof translated === 'object' && !Array.isArray(translated), `${trail} must remain an object`)
    for (const [key, value] of Object.entries(source)) check(value, translated[key], trail ? `${trail}.${key}` : key)
    return
  }
  assert.equal(typeof translated, 'string', `${trail} has no translation`)
  assert.equal(translated.length > 0 || source.length === 0, true, `${trail} is empty`)
  assert.deepEqual(placeholders(translated), placeholders(source), `${trail} changed interpolation tokens`)
}

check(en, ru)
check(en, zh)
check(en, ptBR)
const leafPaths = (value, prefix = '') => {
  if (Array.isArray(value)) return value.flatMap((entry, index) => leafPaths(entry, `${prefix}.${index}`))
  if (value !== null && typeof value === 'object') return Object.entries(value).flatMap(([key, entry]) => leafPaths(entry, prefix ? `${prefix}.${key}` : key))
  return [prefix]
}
assert.deepEqual(leafPaths(zh).sort(), leafPaths(en).sort(), 'Simplified Chinese keys must match English exactly')
assert.deepEqual(leafPaths(ptBR).sort(), leafPaths(en).sort(), 'Brazilian Portuguese keys must match English exactly')
assert.equal(ru.whatsNew.releases.v307.items[0].target, en.whatsNew.releases.v307.items[0].target)
assert.equal(zh.whatsNew.releases.v307.items[0].target, en.whatsNew.releases.v307.items[0].target)
assert.equal(ptBR.whatsNew.releases.v307.items[0].target, en.whatsNew.releases.v307.items[0].target)
for (const [language, locale] of [['en', en], ['ru', ru], ['zh-Hans', zh], ['pt-BR', ptBR]]) {
  assert.deepEqual(Object.keys(locale.whatsNew.releases), ['v413', 'v412', 'v410', 'v405', 'v401', 'v400', 'v307', 'v306'], `${language} must preserve the release order`)
  assert.equal(locale.whatsNew.releases.v413.version, '4.1.3', `${language} has the wrong marker progress release version`)
  assert.equal(locale.whatsNew.releases.v413.items.length, 2, `${language} must include marker actions and progress filters`)
  assert.equal(locale.whatsNew.releases.v412.version, '4.1.2', `${language} has the wrong spoiler release version`)
  assert.equal(locale.whatsNew.releases.v412.items.length, 2, `${language} must include two concise spoiler release notes`)
  assert.equal(locale.whatsNew.releases.v410.version, '4.1.0', `${language} has the wrong character-pin release version`)
  assert.equal(locale.whatsNew.releases.v410.items.length, 2, `${language} must include the fix and character-picker shortcut`)
  assert.equal(locale.whatsNew.releases.v410.items[1].target, 'character-pins', `${language} must link to the character dropdown`)
  assert.equal(locale.whatsNew.releases.v405.version, '4.0.5', `${language} has the wrong new release version`)
  assert.equal(locale.whatsNew.releases.v405.items.length, 1, `${language} must include one local-world fix note`)
  assert.equal(locale.whatsNew.releases.v401.version, '4.0.1', `${language} has the wrong Lingonberries release version`)
  assert.equal(locale.whatsNew.releases.v401.items.length, 1, `${language} must include one Lingonberries release note`)
  assert.equal(locale.whatsNew.releases.v401.footer.target, 'feedback', `${language} must link to Feedback`)
  assert.equal(locale.whatsNew.releases.v400.version, '4.0.0', `${language} must retain the language release`)
  assert.equal(locale.whatsNew.releases.v400.items.length, 1, `${language} must include one concise language release note`)
  assert.equal(locale.whatsNew.releases.v307.version, '3.0.7', `${language} must retain the previous release`)
  assert.equal(locale.whatsNew.releases.v306.version, '3.0.6', `${language} must retain the earlier release`)
}
assert.match(fs.readFileSync(path.join(root, 'src/features/whats-new/whats-new-release.ts'), 'utf8'), /WHATS_NEW_VERSION = '4\.1\.3'/)

const sourceFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const name = path.join(directory, entry.name)
  return entry.isDirectory() ? sourceFiles(name) : /\.[jt]sx?$/.test(name) ? [name] : []
})
const get = (object, key) => key.split('.').reduce((value, part) => value?.[part], object)
for (const file of sourceFiles(path.join(root, 'src'))) {
  const source = fs.readFileSync(file, 'utf8')
  for (const match of source.matchAll(/\bt\(\s*(['"])([^'"\r\n]+)\1(?=\s*[,)])/g)) {
    const key = match[2]
    const hasSource = get(en, key) !== undefined || ['one', 'few', 'many', 'other'].some((suffix) => get(en, `${key}_${suffix}`) !== undefined)
    assert.ok(hasSource, `${path.relative(root, file)} uses missing English key ${key}`)
  }
}

const pluralGroups = [
  'baseOperations.hero.unlinkedSummary', 'baseOperations.hero.fuelSummary',
  'baseOperations.hero.outputSummary', 'baseOperations.production.groupStatus.needsFuel',
  'baseOperations.production.groupStatus.collectOutput', 'baseOperations.production.groupStatus.processing',
  'baseOperations.production.groupStatus.fermenting', 'baseOperations.production.groupStatus.idle',
  'planner.containers.chestCount', 'planner.containers.subject', 'item.usedInRecipes',
  'map.searchSpots', 'map.containers.count', 'map.containers.more',
  'map.containers.groupTitle', 'map.containers.groupItems', 'map.containers.itemCount',
  'building.inspector.collapseNote', 'itemSources.mapSpots',
  'database.usedToCraft', 'map.searchMore', 'map.nearbyLocations',
  'itemSources.more', 'itemSources.showMore', 'planner.overlay.more', 'item.setEffectDescription',
]

for (const group of pluralGroups) {
  for (const suffix of ['one', 'few', 'many', 'other']) {
    assert.equal(typeof get(ru, `${group}_${suffix}`), 'string', `${group}_${suffix} is missing`)
  }
}

await i18next.init({ lng: 'ru', fallbackLng: 'en', resources: { en: { translation: en }, ru: { translation: ru } } })
assert.equal(i18next.t('map.containers.count', { count: 1 }), '1 сундук')
assert.equal(i18next.t('map.containers.count', { count: 2 }), '2 сундука')
assert.equal(i18next.t('map.containers.count', { count: 5 }), '5 сундуков')
assert.equal(i18next.t('map.searchMore', { count: 1 }), 'Показать ещё 1 результат')
assert.equal(i18next.t('map.searchMore', { count: 2 }), 'Показать ещё 2 результата')
assert.equal(i18next.t('map.searchMore', { count: 5 }), 'Показать ещё 5 результатов')
assert.equal(i18next.t('planner.mapMode.dropsItem', { item: 'Древесина' }), 'Выпадает Древесина')

await i18next.changeLanguage('zh-Hans')
i18next.addResourceBundle('zh-Hans', 'translation', zh)
assert.equal(i18next.t('map.progression.eikthyr'), '赤血灵鹿')
assert.equal(i18next.t('filters.creatures.greydwarf'), '灰矮人')
assert.equal(i18next.t('database.dropChance', { chance: 25, minimum: 1, maximum: 3 }), '掉落概率25% · 数量1–3')
assert.equal(i18next.t('map.searchMore', { count: 2 }), '显示另外2条结果')
assert.equal(i18next.t('baseOperations.hero.unlinkedSummary', { count: 2 }), '2条传送门路线未配对')

await i18next.changeLanguage('pt-BR')
i18next.addResourceBundle('pt-BR', 'translation', ptBR)
assert.equal(i18next.t('database.whereToGet'), 'Onde conseguir')
assert.equal(i18next.t('map.containers.count', { count: 1 }), '1 baú')
assert.equal(i18next.t('map.containers.count', { count: 2 }), '2 baús')
assert.equal(i18next.t('itemSources.resourceKinds.pickable', { item: 'Cenoura' }), 'Ponto de coleta de Cenoura')
assert.equal(i18next.t('planner.mapMode.dropsItem', { item: 'Cenoura' }), 'fornece Cenoura')

console.log('Russian, Simplified Chinese and Brazilian Portuguese locales: source keys, interpolation, metadata and representative wording passed')
