import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LANGUAGE, ENABLED_LANGUAGES, normalizeLanguage } from "./language-policy";

const STORAGE_KEY = "gm:app-language";
const localeLoaders = import.meta.glob("./locales/en.json", {
  import: "default",
}) as Record<string, () => Promise<Record<string, unknown>>>;

const storedLanguage = typeof window === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
const requestedLanguage = normalizeLanguage(storedLanguage);

const loadTranslation = async (language: string) => {
  const loader = localeLoaders[`./locales/${language}.json`];
  if (!loader) throw new Error(`No translation bundle is registered for "${language}".`);
  return loader();
};

let initialization: Promise<void> | null = null;

/** Load only English and the user's active locale before React renders. */
export const initializeI18n = () => {
  if (initialization) return initialization;
  initialization = (async () => {
    const languages = [...new Set([DEFAULT_LANGUAGE, requestedLanguage])];
    const entries = await Promise.all(languages.map(async (language) => [
      language,
      { translation: await loadTranslation(language) },
    ] as const));

    await i18n.use(initReactI18next).init({
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: [...ENABLED_LANGUAGES],
      lng: requestedLanguage,
      resources: Object.fromEntries(entries),
      interpolation: { escapeValue: false },
      returnNull: false,
    });

    if (typeof document !== "undefined") document.documentElement.lang = requestedLanguage;
  })();
  return initialization;
};

const ensureLanguageLoaded = async (language: string) => {
  await initializeI18n();
  if (i18n.hasResourceBundle(language, "translation")) return;
  const translation = await loadTranslation(language);
  i18n.addResourceBundle(language, "translation", translation, true, true);
};

/** Language switches fetch one small locale chunk on demand, then repaint. */
export const changeI18nLanguage = async (language: string) => {
  language = normalizeLanguage(language);
  try {
    await ensureLanguageLoaded(language);
    await i18n.changeLanguage(language);
    if (typeof document !== "undefined") document.documentElement.lang = language;
  } catch (error) {
    console.error(`The "${language}" translation could not be loaded.`, error);
  }
};

export default i18n;
