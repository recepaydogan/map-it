import { useCallback, useEffect, useSyncExternalStore } from "react";
import { GAME_CONFIG } from "../game-config";
import { fetchGameLocalePack } from "./locale-content";
import { useAppLanguage } from "./app-language";
import i18n from "./index";
import { createGameDictionary, getKeyedGameText, type GameDictionary, type PackedSource, type PackedValues } from "./game-dictionary";
import { createMapEntityDictionary, getMapEntityText, type MapEntityEntry } from "./map-entity-text";
import { createItemEffectDictionary, type ItemEffectPack } from "./item-effect-text";
export { createGameDictionary } from "./game-dictionary";

const dictionaries = new Map<string, GameDictionary>();
const mapEntities = new Map<string, Map<string, MapEntityEntry>>();
const itemEffects = new Map<string, Map<string, string>>();
const questOfferTitles = new Map<string, Map<string, { english: string; name: string }>>();
const markerCreatures = new Map<string, Map<string, { english: string; name: string }>>();
const requests = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let revision = 0;
let sourceRequest: Promise<PackedSource> | undefined;
let mapFallbackRequest: Promise<{ version: number; locales: Record<string, Record<string, string>> }> | undefined;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const getSnapshot = () => revision;
const getServerSnapshot = () => 0;

const fetchPack = fetchGameLocalePack;

function loadSource(): Promise<PackedSource> {
  sourceRequest ??= fetchPack<PackedSource>("source.json").then((source) => {
    if (source.version !== 1 || !Array.isArray(source.keys) ||
      !Array.isArray(source.values) || source.keys.length !== source.values.length) {
      throw new Error("Invalid game locale source");
    }
    return source;
  }).catch((error: unknown) => { sourceRequest = undefined; throw error; });
  return sourceRequest;
}

function loadMapFallbacks() {
  mapFallbackRequest ??= fetchPack<{ version: number; locales: Record<string, Record<string, string>> }>(
    "map-entity-app-fallbacks.json",
  ).then((pack) => {
    if (pack.version !== 1 || !pack.locales) throw new Error("Invalid map entity fallbacks");
    return pack;
  }).catch((error: unknown) => { mapFallbackRequest = undefined; throw error; });
  return mapFallbackRequest;
}

export function loadGameText(language: string): Promise<void> {
  if (language === "en" || !GAME_CONFIG.gameLocaleDirectory) return Promise.resolve();
  const locale = GAME_CONFIG.gameLocaleCodes?.[language];
  if (!locale) return Promise.reject(new Error(`Missing game locale mapping: ${language}`));
  if (dictionaries.has(language)) return Promise.resolve();
  let request = requests.get(language);
  if (!request) {
    request = Promise.all([loadSource(), fetchPack<PackedValues>(`${locale}.json`),
      fetchPack<PackedSource>("map-entity-source.json"),
      fetchPack<PackedValues>(`map-entity-${locale}.json`), loadMapFallbacks(),
      fetchPack<ItemEffectPack>(`item-effects-${locale}.json`),
      fetchPack<ItemEffectPack>(`item-effects-wowhead-${locale}.json`),
      fetchPack<{ version: number; locale: string; quests: Record<string, { english: string; name: string }> }>(
        `quest-offer-${locale}.json`),
      fetchPack<{ version: number; locale: string; creatures: Record<string, { english: string; name: string }> }>(
        `marker-creature-${locale}.json`)])
      .then(([source, translated, entitySource, entityPack, fallbackPack, effectPack,
        wowheadEffectPack, offerPack, creaturePack]) => {
      const fallbacks = fallbackPack.locales[locale];
      if (!fallbacks) throw new Error(`Missing map entity fallbacks: ${locale}`);
      if (offerPack.version !== 1 || offerPack.locale !== locale || !offerPack.quests) {
        throw new Error(`Invalid quest offer locale: ${locale}`);
      }
      if (creaturePack.version !== 1 || creaturePack.locale !== locale || !creaturePack.creatures) {
        throw new Error(`Invalid marker creature locale: ${locale}`);
      }
      mapEntities.set(language, createMapEntityDictionary(entitySource, entityPack, fallbacks));
      const effects = createItemEffectDictionary(effectPack);
      for (const [english, localized] of createItemEffectDictionary(wowheadEffectPack)) {
        effects.set(english, localized);
      }
      itemEffects.set(language, effects);
      questOfferTitles.set(language, new Map(Object.entries(offerPack.quests)));
      markerCreatures.set(language, new Map(Object.entries(creaturePack.creatures)));
      dictionaries.set(language, createGameDictionary(source, translated));
      revision += 1;
      listeners.forEach((listener) => listener());
    }).catch((error: unknown) => { requests.delete(language); throw error; });
    requests.set(language, request);
  }
  return request;
}

/** Lookup for data loaders that cannot use a React hook. */
function resolveGameText(
  language: string,
  dictionary: GameDictionary | undefined,
  entities: Map<string, MapEntityEntry> | undefined,
  effects: Map<string, string> | undefined,
  offers: Map<string, { english: string; name: string }> | undefined,
  creatures: Map<string, { english: string; name: string }> | undefined,
  english: string,
  key?: string,
): string {
  const questId = /^Quest:(\d+):0$/.exec(key ?? "")?.[1];
  const offer = questId ? offers?.get(questId) : undefined;
  const creatureId = /^Creature:(\d+):0$/.exec(key ?? "")?.[1];
  const creature = creatureId ? creatures?.get(creatureId) : undefined;
  const translated = getKeyedGameText(dictionary, english, key)
    ?? getMapEntityText(entities, english, key)
    ?? (offer?.english === english ? offer.name : undefined)
    ?? (creature?.english === english ? creature.name : undefined)
    ?? effects?.get(english)
    ?? (key?.startsWith("Quest:") ? english : dictionary?.byEnglish.get(english)) ?? english;
  if (translated !== english || language === "en") return translated;
  const itemId = /^ItemSparse:(\d+):4$/.exec(key ?? "")?.[1];
  if (!itemId) return english;
  const lootKey = `bossGuide.lootNames.${itemId}`;
  return i18n.getResource("en", "translation", lootKey) === english
    ? i18n.t(lootKey, { lng: language, defaultValue: english }) : english;
}

export function getGameText(language: string, english: string, key?: string): string {
  return resolveGameText(language, dictionaries.get(language), mapEntities.get(language),
    itemEffects.get(language), questOfferTitles.get(language), markerCreatures.get(language), english, key);
}

export function useGameText() {
  const language = useAppLanguage();
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    void loadGameText(language).catch((error: unknown) => {
      console.error("Failed to load game text", error);
    });
  }, [language]);
  const dictionary = dictionaries.get(language);
  const entities = mapEntities.get(language);
  const effects = itemEffects.get(language);
  const offers = questOfferTitles.get(language);
  const creatures = markerCreatures.get(language);
  return useCallback((english: string, key?: string): string =>
    resolveGameText(language, dictionary, entities, effects, offers, creatures, english, key),
  [language, dictionary, entities, effects, offers, creatures]);
}
