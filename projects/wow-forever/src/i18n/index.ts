import { SUBSCRIPTION_LOCALE_CONFIG } from "../game-config";
import { startSubscriptionTranslations } from "./subscription-translations";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { GAME_CONFIG } from "../game-config";
import { APP_LANGUAGES } from "./language-order";
import { fetchAppLocalePack } from "./locale-content";

const STORAGE_KEY = "gm:app-language";
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

// UI copy is bundled for offline startup and refreshed from the same CDN snapshot.
void Promise.all(APP_LANGUAGES.map(async ({ code }) => {
  const translation = await fetchAppLocalePack(code);
  if (translation) {
    // Previously published/cached locale packs must not restore the retired addon name.
    const renamed = JSON.parse(JSON.stringify(translation).replace(/WFM Position Bridge/gi, "WFM Addon")) as Record<string, unknown>;
    // Subscription copy has an independent text-only channel.
    for (const key of ["premiumPlans", "subscriptionSettings", "ads"]) delete renamed[key];
    i18n.addResourceBundle(code, "translation", renamed, true, true);
  }
})).then(() => {
  void i18n.changeLanguage(i18n.language);
});

startSubscriptionTranslations(i18n, SUBSCRIPTION_LOCALE_CONFIG);

export default i18n;
