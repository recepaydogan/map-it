import { GAME_CONFIG } from '../../game-config';
import { contentUrl } from '../../lib/content-url';

export type WikiKind = 'weapons' | 'vehicles' | 'characters';
export interface WikiEntry {
  id: string;
  kind: WikiKind;
  name: string;
  category: string;
  categories?: string[];
  manufacturer: string;
  image?: string;
  thumbnail?: string;
  description: string[];
  facts: { label: string; value: string }[];
  newToSeries: boolean;
}
export interface WikiCatalog { version: number; records: WikiEntry[] }
let catalogPromise: Promise<WikiCatalog> | undefined;
export function loadWikiCatalog(): Promise<WikiCatalog> {
  catalogPromise ??= fetch(contentUrl(GAME_CONFIG.wikiCatalogPath!))
    .then(async response => {
      if (!response.ok) throw new Error(`Wiki HTTP ${response.status}`);
      const catalog = await response.json() as WikiCatalog;
      if (catalog.version !== 1 || !Array.isArray(catalog.records)) throw new Error('Invalid wiki catalog');
      return catalog;
    }).catch(error => { catalogPromise = undefined; throw error; });
  return catalogPromise;
}
const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function filterWikiEntries(entries: WikiEntry[], kind: WikiKind, query: string, category: string, manufacturer: string) {
  const tokens = normalize(query).trim().split(/\s+/).filter(Boolean);
  return entries.filter(entry => entry.kind === kind
    && (!category || (entry.categories ?? [entry.category]).includes(category))
    && (!manufacturer || entry.manufacturer === manufacturer)
    && tokens.every(token => normalize([entry.name, entry.manufacturer, entry.category,
      ...entry.facts.map(fact => fact.value)].join(' ')).includes(token)));
}
