import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import i18next from 'i18next'
import { buildRecipeGraph, stationName } from '../../src/lib/crafting/build-recipe-graph.ts'
import { buildItemAcquisitionCatalog, itemAcquisitionSources } from '../../src/lib/item-acquisition.ts'
import { prepareGameLocalization } from '../../src/lib/valheim/game-localization.ts'
import { resourceSourceLabel } from '../../src/lib/valheim/resource-source-label.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (file: string) => JSON.parse(readFileSync(path.join(root, file), 'utf8'))
const game = (file: string) => read(`public/game-data/${file}`)

test('item source cards render Chinese for real resource nodes and crafting stations', async () => {
  const localization = prepareGameLocalization(game('localization.json'), 'zh-Hans')
  const intelligence = game('marker-intelligence.json')
  const planner = game('planner-catalog.json')
  const locale = read('src/i18n/locales/zh-Hans.json')
  const i18n = i18next.createInstance()
  await i18n.init({ lng: 'zh-Hans', resources: { 'zh-Hans': { translation: locale } }, interpolation: { escapeValue: false } })
  const translate = (key: string, options: { item: string }) => i18n.t(key, options)

  const graph = buildRecipeGraph(planner, intelligence.items)
  graph.stations = new Map([...graph.stations].map(([key, station]) => [key, {
    ...station, name: localization.translateText(station.name),
  }]))
  const carrot = { ...intelligence.items.carrot, name: localization.translateText(intelligence.items.carrot.name) }
  const catalog = buildItemAcquisitionCatalog([], graph, intelligence)
  const carrotSource = itemAcquisitionSources(carrot, catalog).find((source) => source.prefabName === 'Pickable_Carrot')
  assert.ok(carrotSource)
  assert.equal(resourceSourceLabel(carrotSource.resourceKind, carrot.name, translate), '胡萝卜采集点')
  assert.equal(stationName(graph, 'piece_MeadCauldron'), '蜜酒壶')

  const untranslated = Object.values(planner.resourceNodes as Record<string, { kind: string; items: Array<{ prefabName: string }> }>)
    .flatMap((node) => node.items.map((yielded) => {
      const item = intelligence.items[yielded.prefabName.toLowerCase()]
      const name = localization.translateText(item?.name ?? yielded.prefabName)
      return { prefab: yielded.prefabName, label: resourceSourceLabel(node.kind, name, translate) }
    }))
    .filter(({ label }) => !/[\u3400-\u9fff]/u.test(label))
  assert.deepEqual(untranslated, [])
  assert.deepEqual([...graph.stations.values()].filter(({ name }) => !/[\u3400-\u9fff]/u.test(name)), [])
})

test('item source cards use Brazilian Portuguese for real resource nodes and crafting stations', async () => {
  const localization = prepareGameLocalization(game('localization.json'), 'pt-BR')
  const gameTable = game('localization.json')
  const officialUnchanged = new Set(Object.entries(gameTable.english as Record<string, string>)
    .filter(([token, english]) => gameTable.translations.Portuguese_Brazilian[token] === english)
    .map(([, english]) => english))
  const intelligence = game('marker-intelligence.json')
  const planner = game('planner-catalog.json')
  const locale = read('src/i18n/locales/pt-BR.json')
  const i18n = i18next.createInstance()
  await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: locale } }, interpolation: { escapeValue: false } })
  const translate = (key: string, options: { item: string }) => i18n.t(key, options)

  const graph = buildRecipeGraph(planner, intelligence.items)
  graph.stations = new Map([...graph.stations].map(([key, station]) => [key, {
    ...station, name: localization.translateText(station.name),
  }]))
  const carrot = { ...intelligence.items.carrot, name: localization.translateText(intelligence.items.carrot.name) }
  const catalog = buildItemAcquisitionCatalog([], graph, intelligence)
  const carrotSource = itemAcquisitionSources(carrot, catalog).find((source) => source.prefabName === 'Pickable_Carrot')
  assert.ok(carrotSource)
  assert.equal(resourceSourceLabel(carrotSource.resourceKind, carrot.name, translate), 'Ponto de coleta de Cenoura')
  assert.equal(stationName(graph, 'piece_MeadCauldron'), 'Caldeirão de hidromel')
  const untranslatedStations = Object.values(planner.stations as Record<string, { name: string }>)
    .filter(({ name }) => localization.translateText(name) === name && !officialUnchanged.has(name))
  assert.deepEqual(untranslatedStations, [])

  const rawResourceNames = Object.values(planner.resourceNodes as Record<string, { kind: string; items: Array<{ prefabName: string }> }>)
    .flatMap((node) => node.items.map((yielded) => {
      const item = intelligence.items[yielded.prefabName.toLowerCase()]
      return { prefab: yielded.prefabName, name: localization.translateText(item?.name ?? yielded.prefabName) }
    }))
    .filter(({ prefab, name }) => name === prefab && !officialUnchanged.has(prefab))
  assert.deepEqual(rawResourceNames, [])
})
