import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const STORAGE_KEY = "pzim:game-content-language";
const DEFAULT_LANGUAGE = "en";
const localeModules = import.meta.glob("./locales/*.json", {
  eager: true,
  import: "default",
}) as Record<string, Record<string, unknown>>;

const resources = Object.fromEntries(
  Object.entries(localeModules).map(([path, translation]) => [
    path.slice(path.lastIndexOf("/") + 1, -".json".length),
    { translation },
  ]),
);

const initialLanguage =
  typeof window === "undefined"
    ? DEFAULT_LANGUAGE
    : localStorage.getItem(STORAGE_KEY) === "strew"
      ? DEFAULT_LANGUAGE
      : localStorage.getItem(STORAGE_KEY) || DEFAULT_LANGUAGE;

if (typeof document !== "undefined") {
  i18n.on("languageChanged", (language) => {
    document.documentElement.lang = language;
  });
}

void i18n.use(initReactI18next).init({
  fallbackLng: DEFAULT_LANGUAGE,
  lng: initialLanguage,
  resources,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
