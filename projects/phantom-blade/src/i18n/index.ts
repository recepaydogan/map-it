import i18n, { type BackendModule } from "i18next";
import { initReactI18next } from "react-i18next";
import { GAME_CONFIG } from "../game-config";
import { APP_LANGUAGES } from "./language-order";
import english from "./locales/en.json";
import minimapOpacityLocales from "./minimap-opacity-locales.json";
import { CONTENT_BASE_URL, contentUrl } from "../lib/content-url";
import appLocaleRelease from "../../app-locale-release.json";

const STORAGE_KEY = "phantom-blade-app:app-language";
const DEFAULT_LANGUAGE = "en";

type LocalePack = Record<string, unknown> & {
  settings?: Record<string, unknown>;
  updates?: Record<string, unknown> & { releases?: Record<string, unknown> };
};

/** Keep these strings in step with the feature and release notes in the app bundle. */
const withMinimapOpacityCopy = (language: string, pack: LocalePack = {}): LocalePack => {
  const copy = minimapOpacityLocales[language as keyof typeof minimapOpacityLocales];
  if (!copy) return pack;
  return {
    ...pack,
    settings: { ...pack.settings, minimapOpacity: copy.title, minimapOpacityDesc: copy.description },
    updates: {
      ...pack.updates,
      releases: { ...pack.updates?.releases, v104: { ...english.updates.releases.v104, items: [copy.note] } },
    },
  };
};

const localeBackend: BackendModule = {
  type: "backend",
  init() {},
  read(language, _namespace, callback) {
    if (language === DEFAULT_LANGUAGE) { callback(null, english); return; }
    if (!APP_LANGUAGES.some(option => option.code === language)) { callback(null, {}); return; }
    const fallbackUrl = contentUrl(`locales/${language}.json`);
    const releaseUrl = CONTENT_BASE_URL === appLocaleRelease.contentBaseUrl
      ? `${appLocaleRelease.baseUrl}/${language}.json`
      : fallbackUrl;
    const readPack = async (url: string): Promise<LocalePack> => {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`UI locale unavailable: ${response.status}`);
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid UI locale.");
      return value as LocalePack;
    };
    void readPack(releaseUrl)
      .catch(error => {
        if (releaseUrl === fallbackUrl) throw error;
        return readPack(fallbackUrl);
      })
      .then(pack => callback(null, withMinimapOpacityCopy(language, pack)))
      .catch((error: unknown) => {
        if (Object.hasOwn(minimapOpacityLocales, language)) {
          callback(null, withMinimapOpacityCopy(language));
        } else {
          callback(error instanceof Error ? error : new Error("UI locale unavailable."), false);
        }
      });
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
