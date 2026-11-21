interface SearchCatalog {
  items: unknown
  characters: unknown
  traders: unknown
  resourceNodes: unknown
  rooms?: unknown[]
  creatureTransitions?: Record<string, string[]>
}
export function createLocationSearchTerms(catalog: SearchCatalog): (contents: unknown) => string[]
export function createLocationSearchData(catalog: SearchCatalog): (contents: unknown) => {
  searchTerms: string[]
  itemSources: import('../src/types/game-data.ts').LocationItemSource[]
}
