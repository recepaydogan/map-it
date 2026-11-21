import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { APP_LANGUAGES } from "./language-order.ts";
import { GAME_CONFIG } from "../game-config.ts";
import { loadGameLanguage } from "../features/knowledge/game-language-dictionary.ts";
import english from "./locales/en.json" with { type: "json" };
import chinese from "./locales/zh-Hans.json" with { type: "json" };
import hindi from "./locales/hi-IN.json" with { type: "json" };
import spanish from "./locales/es.json" with { type: "json" };
import french from "./locales/fr.json" with { type: "json" };
import portugueseBrazil from "./locales/pt-BR.json" with { type: "json" };

const STORAGE_KEY = "gm:app-language";
const DEFAULT_LANGUAGE = "en";
const resources = {
  en: { translation: english },
  "zh-Hans": { translation: chinese },
  "hi-IN": { translation: hindi },
  es: { translation: spanish },
  fr: { translation: french },
  "pt-BR": { translation: portugueseBrazil },
};

const storedLanguage = typeof window === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
const initialLanguage = storedLanguage && APP_LANGUAGES.some(({ code }) => code === storedLanguage)
  ? storedLanguage
  : DEFAULT_LANGUAGE;

if (typeof document !== "undefined") {
  document.title = GAME_CONFIG.appName;
  i18n.on("languageChanged", (language) => {
    document.documentElement.lang = language;
  });
}

void i18n.use(initReactI18next).init({
  fallbackLng: DEFAULT_LANGUAGE,
  lng: initialLanguage,
  resources,
  interpolation: { escapeValue: false, defaultVariables: { appName: GAME_CONFIG.appName } },
  returnNull: false,
});

export const refreshGameLanguage = (language: string) => {
  void loadGameLanguage(language).then(() => {
    if (i18n.language === language) void i18n.changeLanguage(language);
  }).catch((error: unknown) => console.error("Game language could not be loaded.", error));
};
refreshGameLanguage(initialLanguage);

export default i18n;
