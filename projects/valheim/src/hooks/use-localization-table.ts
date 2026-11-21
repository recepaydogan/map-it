import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { prepareGameLocalization, type GameLocalization, type LocalizationPayload, type LocalizationTable } from '../lib/valheim/game-localization'

let tablePromise: Promise<LocalizationPayload> | null = null
const prepared = new Map<string, GameLocalization>()

/**
 * The game's localization tables (token → text), loaded once per session.
 * Missing game-language entries fall back to the game's English text.
 */
const loadTable = () => {
  tablePromise ??= fetch('/game-data/localization.json')
    .then((response) => {
      if (!response.ok) throw new Error(`localization request failed: ${response.status}`)
      return response.json() as Promise<LocalizationPayload>
    })
    .catch((error: unknown) => {
      tablePromise = null
      throw error
    })
  return tablePromise
}

const prepareLocalization = (payload: LocalizationPayload, language: string): GameLocalization => {
  const cached = prepared.get(language)
  if (cached) return cached
  const result = prepareGameLocalization(payload, language)
  prepared.set(language, result)
  return result
}

export function useGameLocalization(): GameLocalization | null {
  const { i18n } = useTranslation()
  const [payload, setPayload] = useState<LocalizationPayload | null>(null)
  useEffect(() => {
    let active = true
    loadTable()
      .then((loaded) => { if (active) setPayload(loaded) })
      .catch((error: unknown) => console.warn('[Localization] Could not load the game text table', error))
    return () => { active = false }
  }, [])
  return useMemo(
    () => payload ? prepareLocalization(payload, i18n.language) : null,
    [payload, i18n.language],
  )
}

export function useLocalizationTable(): LocalizationTable | null {
  return useGameLocalization()?.table ?? null
}
