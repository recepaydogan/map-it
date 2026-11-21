/**
 * i18n bootstrap. Imported for its side effect from main.tsx BEFORE the app
 * renders, so `useTranslation()` is ready on first paint.
 *
 * The fallback language (English) is bundled eagerly — it's the source catalog
 * and must always be present. Every other language is a dynamic import, so Vite
 * code-splits each into its own chunk fetched only when first selected (keeps the
 * Overwolf bundle lean as languages are added).
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { loadDataLanguage } from "../data/localized-data";
import { track } from "../services/analytics/analytics";
import { EVENTS } from "../services/analytics/events";
import en from "./locales/en.json";
import {
  FALLBACK_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  SUPPORTED_LANGUAGE_CODES,
  normalizeLanguage,
} from "./config";

/** Lazy catalog loaders for every non-fallback language. */
const LOADERS: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  de: () => import("./locales/de.json"),
  es: () => import("./locales/es.json"),
  "es-419": () => import("./locales/es-419.json"),
  fr: () => import("./locales/fr.json"),
  it: () => import("./locales/it.json"),
  ja: () => import("./locales/ja.json"),
  ko: () => import("./locales/ko.json"),
  pl: () => import("./locales/pl.json"),
  pt: () => import("./locales/pt.json"),
  ru: () => import("./locales/ru.json"),
  th: () => import("./locales/th.json"),
  "zh-Hans": () => import("./locales/zh-Hans.json"),
  "zh-Hant": () => import("./locales/zh-Hant.json"),
};

/** Regional variants fall back through their base language before English, so a
 *  key not yet translated in the variant shows the base translation, not English.
 *  Every language listed here must also have its chain loaded (see applyLanguage). */
const FALLBACK_CHAIN: Record<string, string[]> = {
  "es-419": ["es"],
};

const loaded = new Set<string>([FALLBACK_LANGUAGE]);

/** The language to open with: a valid stored choice wins; else detect from the
 *  browser/OS; else English. */
const initialLanguage = (): string => {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGE_CODES.includes(stored)) return stored;
  } catch {
    // localStorage can throw in locked-down contexts — fall through to detection.
  }
  return normalizeLanguage(typeof navigator !== "undefined" ? navigator.language : null);
};

void i18n.use(initReactI18next).init({
  resources: { [FALLBACK_LANGUAGE]: { translation: en } },
  lng: FALLBACK_LANGUAGE,
  fallbackLng: {
    ...Object.fromEntries(
      Object.entries(FALLBACK_CHAIN).map(([code, chain]) => [code, [...chain, FALLBACK_LANGUAGE]]),
    ),
    default: [FALLBACK_LANGUAGE],
  },
  supportedLngs: SUPPORTED_LANGUAGE_CODES,
  interpolation: { escapeValue: false }, // React already escapes output.
  // No Suspense: non-fallback catalogs are added imperatively (addResourceBundle)
  // and a re-render is driven by changeLanguage, so there's nothing to suspend on.
  react: { useSuspense: false },
});

/** Reflect the active language on <html> (lang + writing direction). */
const applyDocument = (code: string): void => {
  if (typeof document === "undefined") return;
  const meta = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  document.documentElement.lang = code;
  document.documentElement.dir = meta?.dir ?? "ltr";
};

/** Load (once) + switch to a language. Safe to call repeatedly. */
export const applyLanguage = async (raw: string): Promise<void> => {
  const code = SUPPORTED_LANGUAGE_CODES.includes(raw) ? raw : FALLBACK_LANGUAGE;
  // Load the language AND its fallback chain (a fallback catalog that isn't
  // loaded can't be fallen back into).
  for (const c of [code, ...(FALLBACK_CHAIN[code] ?? [])]) {
    if (!loaded.has(c) && LOADERS[c]) {
      const mod = await LOADERS[c]();
      i18n.addResourceBundle(c, "translation", mod.default, true, true);
      loaded.add(c);
    }
  }
  // Localize the GAME DATA (item/marker/region names) BEFORE flipping the UI
  // language, so consumers read the swapped data on the same re-render.
  await loadDataLanguage(code);
  if (i18n.language !== code) await i18n.changeLanguage(code);
  applyDocument(code);
};

/** Persist + apply a language choice (the switcher calls this). Writing to
 *  localStorage also notifies the OTHER window via the `storage` listener below. */
export const setLanguage = (code: string): void => {
  // Only a real switch — the switcher can re-select the current language.
  if (code !== i18n.language) {
    track(EVENTS.LANGUAGE_CHANGED, { from: i18n.language, to: code });
  }
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    // Non-fatal — the language still applies for this session.
  }
  void applyLanguage(code);
};

// Live cross-window/-tab sync: when the OTHER window writes a new language, mirror
// it here without a reload (desktop ↔ in-game overlay stay in lockstep).
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === LANGUAGE_STORAGE_KEY && e.newValue) void applyLanguage(e.newValue);
  });
}

// Apply the initial language (fetches its chunk first when non-English).
void applyLanguage(initialLanguage());

export default i18n;
