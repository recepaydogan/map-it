import i18n, { type BackendModule } from "i18next";
import { initReactI18next } from "react-i18next";
import { GAME_CONFIG } from "../game-config";
import { APP_LANGUAGES } from "./language-order";
import english from "./locales/en.json";
import { contentUrl } from "../lib/content-url";

const STORAGE_KEY = "map-it:app-language";
const DEFAULT_LANGUAGE = "en";
const localeBackend: BackendModule = {
  type: "backend",
  init() {},
  read(language, _namespace, callback) {
    if (language === DEFAULT_LANGUAGE) { callback(null, english); return; }
    if (!APP_LANGUAGES.some(option => option.code === language)) { callback(null, {}); return; }
    void fetch(contentUrl(`locales/${language}.json`), { signal: AbortSignal.timeout(15000) })
      .then(async response => {
        if (!response.ok) throw new Error(`UI locale unavailable: ${response.status}`);
        const value: unknown = await response.json();
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid UI locale.");
        callback(null, value);
      }).catch((error: unknown) => callback(error instanceof Error ? error : new Error("UI locale unavailable."), false));
  },
};

const storedLanguage = typeof window === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
const initialLanguage = storedLanguage && APP_LANGUAGES.some(({ code }) => code === storedLanguage)
  ? storedLanguage
  : DEFAULT_LANGUAGE;

if (typeof document !== "undefined") {
  i18n.on("languageChanged", (language) => {
    document.documentElement.lang = language;
  });
}

void i18n.use(localeBackend).use(initReactI18next).init({
  fallbackLng: DEFAULT_LANGUAGE,
  lng: initialLanguage,
  resources: { en: { translation: english } },
  partialBundledLanguages: true,
  load: "currentOnly",
  supportedLngs: APP_LANGUAGES.map(option => option.code),
  react: { useSuspense: false },
  interpolation: { escapeValue: false, defaultVariables: { app: GAME_CONFIG.appName } },
  returnNull: false,
});

export default i18n;
