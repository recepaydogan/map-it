import { create } from "zustand";
import { applyItemOverlay, type ItemTextOverlay } from "./er-items-data";
import { applyMarkerOverlay, type MarkerTextOverlay } from "./er-markers-data";
import { applyNrTextOverlay } from "./nightreign-data";
import { applyErMapTextOverlay, type ErMapTextOverlay } from "./er-map-text";
import { rebuildMarkerIndexes } from "./markers";

/** Flat { englishText: localizedText } overlay for the Nightreign data. */
type NrTextOverlay = Record<string, string>;

/**
 * Game-DATA localization orchestrator. The English er-items.json / er-markers.json
 * are the frozen single source of truth for ALL structure (ids, coordinates,
 * stats, drops). For a non-English language we lazy-load a TEXT-ONLY overlay
 * (`{ id: localizedText }`, no coordinates) and layer it onto the base BY ID, so
 * positions and the marker set are inherited verbatim — only names / descriptions
 * / regions swap. Built by data/src/build-i18n-overlays.mjs.
 */

const ITEM_LOADERS: Record<string, () => Promise<{ default: ItemTextOverlay }>> = {
  de: () => import("./generated/i18n/er-items.de.json"),
  es: () => import("./generated/i18n/er-items.es.json"),
  "es-419": () => import("./generated/i18n/er-items.es-419.json"),
  fr: () => import("./generated/i18n/er-items.fr.json"),
  pt: () => import("./generated/i18n/er-items.pt.json"),
  it: () => import("./generated/i18n/er-items.it.json"),
  ja: () => import("./generated/i18n/er-items.ja.json"),
  ko: () => import("./generated/i18n/er-items.ko.json"),
  pl: () => import("./generated/i18n/er-items.pl.json"),
  ru: () => import("./generated/i18n/er-items.ru.json"),
  th: () => import("./generated/i18n/er-items.th.json"),
  "zh-Hant": () => import("./generated/i18n/er-items.zh-Hant.json"),
  "zh-Hans": () => import("./generated/i18n/er-items.zh-Hans.json"),
};
const MARKER_LOADERS: Record<string, () => Promise<{ default: MarkerTextOverlay }>> = {
  de: () => import("./generated/i18n/er-markers.de.json"),
  es: () => import("./generated/i18n/er-markers.es.json"),
  "es-419": () => import("./generated/i18n/er-markers.es-419.json"),
  fr: () => import("./generated/i18n/er-markers.fr.json"),
  pt: () => import("./generated/i18n/er-markers.pt.json"),
  it: () => import("./generated/i18n/er-markers.it.json"),
  ja: () => import("./generated/i18n/er-markers.ja.json"),
  ko: () => import("./generated/i18n/er-markers.ko.json"),
  pl: () => import("./generated/i18n/er-markers.pl.json"),
  ru: () => import("./generated/i18n/er-markers.ru.json"),
  th: () => import("./generated/i18n/er-markers.th.json"),
  "zh-Hant": () => import("./generated/i18n/er-markers.zh-Hant.json"),
  "zh-Hans": () => import("./generated/i18n/er-markers.zh-Hans.json"),
};
const TEST_MAP_LOADERS: Record<string, () => Promise<{ default: ErMapTextOverlay }>> = {
  de: () => import("./generated/i18n/er-map.de.json"),
  es: () => import("./generated/i18n/er-map.es.json"),
  "es-419": () => import("./generated/i18n/er-map.es-419.json"),
  fr: () => import("./generated/i18n/er-map.fr.json"),
  pt: () => import("./generated/i18n/er-map.pt.json"),
  it: () => import("./generated/i18n/er-map.it.json"),
  ja: () => import("./generated/i18n/er-map.ja.json"),
  ko: () => import("./generated/i18n/er-map.ko.json"),
  pl: () => import("./generated/i18n/er-map.pl.json"),
  ru: () => import("./generated/i18n/er-map.ru.json"),
  th: () => import("./generated/i18n/er-map.th.json"),
  "zh-Hant": () => import("./generated/i18n/er-map.zh-Hant.json"),
  "zh-Hans": () => import("./generated/i18n/er-map.zh-Hans.json"),
};
const NR_LOADERS: Record<string, () => Promise<{ default: NrTextOverlay }>> = {
  de: () => import("./generated/i18n/nightreign.de.json"),
  es: () => import("./generated/i18n/nightreign.es.json"),
  "es-419": () => import("./generated/i18n/nightreign.es-419.json"),
  fr: () => import("./generated/i18n/nightreign.fr.json"),
  pt: () => import("./generated/i18n/nightreign.pt.json"),
  it: () => import("./generated/i18n/nightreign.it.json"),
  ja: () => import("./generated/i18n/nightreign.ja.json"),
  ko: () => import("./generated/i18n/nightreign.ko.json"),
  pl: () => import("./generated/i18n/nightreign.pl.json"),
  ru: () => import("./generated/i18n/nightreign.ru.json"),
  th: () => import("./generated/i18n/nightreign.th.json"),
  "zh-Hant": () => import("./generated/i18n/nightreign.zh-Hant.json"),
  "zh-Hans": () => import("./generated/i18n/nightreign.zh-Hans.json"),
};

/** Bumped whenever the localized data is swapped, so any consumer that doesn't
 *  already re-render on a UI-language change can subscribe and refresh. */
export const useDataVersion = create<{ version: number }>(() => ({ version: 0 }));

const erCache = new Map<string, { items: ItemTextOverlay; markers: MarkerTextOverlay }>();
const nrCache = new Map<string, NrTextOverlay>();
const erMapCache = new Map<string, ErMapTextOverlay>();
let appliedLang = "en";

/**
 * Localize the game data to `lang` (or back to English for an unsupported / "en"
 * code). Awaited by i18n BEFORE it flips the UI language, so the data is already
 * swapped when consumers re-render. Idempotent + cached per language.
 */
export const loadDataLanguage = async (lang: string): Promise<void> => {
  if (lang === appliedLang) return;
  // ER item / marker overlay. Absent for a language whose ER game FMGs we don't have
  // — that language then keeps English item/marker text but still swaps everything
  // else (UI + Nightreign data), rather than being blocked entirely.
  if (ITEM_LOADERS[lang] && MARKER_LOADERS[lang]) {
    let ov = erCache.get(lang);
    if (!ov) {
      const [items, markers] = await Promise.all([ITEM_LOADERS[lang](), MARKER_LOADERS[lang]()]);
      ov = { items: items.default, markers: markers.default };
      erCache.set(lang, ov);
    }
    applyItemOverlay(ov.items);
    applyMarkerOverlay(ov.markers);
  } else {
    applyItemOverlay(null);
    applyMarkerOverlay(null);
  }

  // ER map flat text dictionary — same lifecycle as the other overlays.
  if (TEST_MAP_LOADERS[lang]) {
    let tm = erMapCache.get(lang);
    if (!tm) {
      tm = (await TEST_MAP_LOADERS[lang]()).default;
      erMapCache.set(lang, tm);
    }
    applyErMapTextOverlay(tm);
  } else {
    applyErMapTextOverlay(null);
  }

  // Nightreign text overlay — loaded independently of the ER overlay.
  if (NR_LOADERS[lang]) {
    let nr = nrCache.get(lang);
    if (!nr) {
      nr = (await NR_LOADERS[lang]()).default;
      nrCache.set(lang, nr);
    }
    applyNrTextOverlay(nr);
  } else {
    applyNrTextOverlay(null);
  }
  rebuildMarkerIndexes();
  appliedLang = lang;
  useDataVersion.setState((s) => ({ version: s.version + 1 }));
};
