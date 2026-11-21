import { SUBSCRIPTION_LOCALE_CONFIG } from "../game-config";
import { startSubscriptionTranslations } from "./subscription-translations";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { GAME_CONFIG } from "../game-config";
import { APP_LANGUAGES } from "./language-order";
import { keepCompatibleTranslations } from "./locale-fallback";

const STORAGE_KEY = "gm:app-language";
const DEFAULT_LANGUAGE = "en";
const localeModules = import.meta.glob("./locales/*.json", {
  eager: true,
  import: "default",
}) as Record<string, Record<string, unknown>>;

const english = localeModules["./locales/en.json"];
if (!english) throw new Error("English app locale is missing");
const resources = Object.fromEntries(APP_LANGUAGES.map(({ code }) => {
  const candidate = localeModules[`./locales/${code}.json`];
  if (!candidate) throw new Error(`App locale is missing: ${code}`);
  return [code, { translation: code === "en" ? candidate : keepCompatibleTranslations(english, candidate) }];
}));

const storedLanguage = typeof window === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
const initialLanguage = storedLanguage && APP_LANGUAGES.some(({ code }) => code === storedLanguage)
  ? storedLanguage
  : DEFAULT_LANGUAGE;

if (typeof document !== "undefined") {
  i18n.on("languageChanged", (language) => {
    document.documentElement.lang = language;
  });
}

void i18n.use(initReactI18next).init({
  fallbackLng: DEFAULT_LANGUAGE,
  lng: initialLanguage,
  resources,
  interpolation: { escapeValue: false, defaultVariables: { app: GAME_CONFIG.appName } },
  returnNull: false,
});

startSubscriptionTranslations(i18n, SUBSCRIPTION_LOCALE_CONFIG);

export default i18n;
