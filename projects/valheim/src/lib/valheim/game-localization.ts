export type LocalizationTable = Record<string, string>

export type LocalizationPayload = {
  english?: LocalizationTable
  translations?: Record<string, LocalizationTable>
}

export type GameLocalization = {
  language: string
  table: LocalizationTable
  translateText: (text: string) => string
}

const languageToGameTable: Record<string, string> = {
  ru: 'Russian',
  'zh-Hans': 'Chinese',
  'pt-BR': 'Portuguese_Brazilian',
}

/**
 * Valheim assembles the names of refinement idols from separate localization
 * tokens. The extracted item catalog only contains their internal prefab ids.
 */
const chineseRefinementIdols = (table: LocalizationTable): Map<string, string> => {
  const result = new Map<string, string>()
  for (const tier of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const material = table[`item_upgrader_tier${tier}`]
    const idol = table.item_upgrader_name
    for (const [kind, token] of [['Armor', 'item_upgrader_armor'], ['Weapon', 'item_upgrader_weapon']] as const) {
      const purpose = table[token]
      if (material && purpose && idol) result.set(`Upgrader${tier}${kind}`, `${material}${purpose}${idol}`)
    }
  }
  return result
}

const brazilianRefinementIdols = (table: LocalizationTable): Map<string, string> => {
  const result = new Map<string, string>()
  const idol = table.item_upgrader_name
  if (!idol) return result
  for (const tier of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const material = table[`item_upgrader_tier${tier}`]
    if (!material) continue
    for (const [kind, token] of [['Armor', 'item_upgrader_armor'], ['Weapon', 'item_upgrader_weapon']] as const) {
      const purpose = table[token]
      if (purpose) result.set(`Upgrader${tier}${kind}`, `${idol} de ${purpose.toLocaleLowerCase('pt-BR')} de ${material.toLocaleLowerCase('pt-BR')}`)
    }
  }
  return result
}

export function prepareGameLocalization(payload: LocalizationPayload, language: string): GameLocalization {
  const gameLanguage = languageToGameTable[language]
  if (!gameLanguage) return { language, table: payload.english ?? {}, translateText: (text) => text }

  const english = payload.english ?? {}
  const translated = payload.translations?.[gameLanguage] ?? {}
  const byEnglish = new Map<string, string>()
  const ambiguous = new Set<string>()
  for (const [token, text] of Object.entries(english)) {
    const translation = translated[token]
    if (!text || !translation || ambiguous.has(text)) continue
    const previous = byEnglish.get(text)
    if (previous && previous !== translation) {
      byEnglish.delete(text)
      ambiguous.add(text)
    } else {
      byEnglish.set(text, translation)
    }
  }
  const explicitNames = gameLanguage === 'Chinese' ? chineseRefinementIdols(translated)
    : gameLanguage === 'Portuguese_Brazilian' ? brazilianRefinementIdols(translated)
    : new Map<string, string>()
  if (gameLanguage === 'Chinese') {
    // These prefab ids have no player-facing name token in the extracted game table.
    // Use descriptive Chinese names wherever the catalog exposes them.
    explicitNames.set('TrophyDeerWhite', `白${translated.item_trophy_deer ?? '鹿战利品'}`)
    explicitNames.set('SeekerBrood', translated.enemy_babyseeker ?? '邪蛛幼雏')
    explicitNames.set('IceShoreShard', '冰岸碎片')
  }
  if (gameLanguage === 'Portuguese_Brazilian') {
    // These prefab ids are absent from Valheim's player-facing name table.
    explicitNames.set('TrophyDeerWhite', 'Troféu de cervo branco')
    explicitNames.set('SeekerBrood', translated.enemy_babyseeker ?? 'Buscador filhote')
    explicitNames.set('IceShoreShard', 'Fragmento da costa gelada')
    // Item and upgrade tokens differ only in capitalization. Prefer the item
    // labels in the catalog instead of treating those English names as ambiguous.
    if (translated.item_blackmarble) explicitNames.set('Black Marble', translated.item_blackmarble)
    if (translated.item_blackmetal) explicitNames.set('Black Metal', translated.item_blackmetal)
  }
  return {
    language,
    table: { ...english, ...translated },
    translateText: (text) => explicitNames.get(text) ?? byEnglish.get(text) ?? text,
  }
}
