import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { GAME_CONFIG } from "../game-config";
import { APP_LANGUAGES } from "./language-order";
import { loadAppLocale } from "./load-app-locale";

const STORAGE_KEY = "gm:app-language";
const DEFAULT_LANGUAGE = "en";
const localeModules = import.meta.glob("./locales/*.json", {
  eager: true,
  import: "default",
}) as Record<string, Record<string, unknown>>;

const resources = Object.fromEntries(
  Object.entries(localeModules).map(([path, translation]) => [
    Intl.getCanonicalLocales(path.slice(path.lastIndexOf("/") + 1, -".json".length))[0],
    { translation },
  ]),
);

const storedLanguage = typeof window === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
const initialLanguage = storedLanguage && APP_LANGUAGES.some(({ code }) => code === storedLanguage)
  ? storedLanguage
  : DEFAULT_LANGUAGE;

if (typeof document !== "undefined") {
  i18n.on("languageChanged", (language) => {
    document.documentElement.lang = language;
    void loadAppLocale(language)?.then((translation) => {
      i18n.addResourceBundle(language, "translation", translation, true, true);
    }).catch((error: unknown) => console.warn("App locale delivery failed; using bundled UI text", error));
  });
}

void i18n.use(initReactI18next).init({
  fallbackLng: DEFAULT_LANGUAGE,
  lng: initialLanguage,
  resources,
  interpolation: { escapeValue: false, defaultVariables: { app: GAME_CONFIG.appName } },
  returnNull: false,
  react: { bindI18nStore: "added" },
});

export default i18n;
