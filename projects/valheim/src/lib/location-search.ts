import type { LocationRecord } from '../types/game-data.ts'
import { locationSearchTerms } from './location-filters.ts'

const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/ı/g, 'i')
const squash = (value: string) => value.replace(/[^\p{L}\p{N}]+/gu, '')

interface SearchEntry {
  text: string
  compact: string
  words: string[]
  ids: Set<string>
}

/** Invert shared terms once; e.g. searching Amber checks one term, not every chest. */
export function buildLocationSearchIndex(
  locations: LocationRecord[],
  label: (location: LocationRecord) => string,
): SearchEntry[] {
  return buildTextSearchIndex(locations.filter((location) => location.enabled).map((location) => ({
    id: location.id,
    terms: [location.prefabName, location.placement.name, label(location),
      ...locationSearchTerms(location), ...(location.searchTerms ?? [])],
  })))
}

export function buildTextSearchIndex(records: Array<{ id: string; terms: Array<string | undefined> }>): SearchEntry[] {
  const byTerm = new Map<string, SearchEntry>()
  for (const record of records) {
    for (const raw of record.terms) {
      if (!raw) continue
      const text = fold(raw.trim())
      const compact = squash(text)
      if (!compact) continue
      let entry = byTerm.get(text)
      if (!entry) {
        entry = { text, compact, words: text.split(/[^\p{L}\p{N}]+/u).filter(Boolean), ids: new Set() }
        byTerm.set(text, entry)
      }
      entry.ids.add(record.id)
    }
  }
  return [...byTerm.values()]
}

// ER's typo rescue: bounded prefix edit distance, with a swapped adjacent pair
// counting as one edit. It also works while a player is still typing the name.
function prefixDistance(value: string, query: string, budget: number): number {
  if (query.length - value.length > budget) return budget + 1
  let previous = Array.from({ length: query.length + 1 }, (_, index) => index)
  let beforePrevious = previous
  let best = budget + 1
  for (let i = 1; i <= Math.min(value.length, query.length + budget); i++) {
    const current = [i]
    for (let j = 1; j <= query.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1,
        previous[j - 1] + (value[i - 1] === query[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && value[i - 1] === query[j - 2] && value[i - 2] === query[j - 1]) {
        current[j] = Math.min(current[j], beforePrevious[j - 2] + 1)
      }
    }
    best = Math.min(best, current[query.length])
    if (Math.min(...current) > budget) break
    beforePrevious = previous
    previous = current
  }
  return best
}

/** null means no search: callers restore the user's usual category filters. */
export function matchLocationSearch(index: SearchEntry[], raw: string, allowFuzzy = true): Set<string> | null {
  const text = fold(raw.trim())
  const compact = squash(text)
  if (!compact) return null
  const ids = new Set<string>()
  const add = (entry: SearchEntry) => { for (const id of entry.ids) ids.add(id) }
  for (const entry of index) {
    if (entry.text.includes(text) || entry.compact.includes(compact)) add(entry)
  }
  // Never dilute actual item/source matches with similar but unrelated names.
  if (ids.size || !allowFuzzy || compact.length < 3 || compact.length > 64) return ids
  const budget = compact.length >= 7 ? 2 : 1
  for (const entry of index) {
    if ([entry.compact, ...entry.words].some((word) => prefixDistance(word, compact, budget) <= budget)) add(entry)
  }
  return ids
}
