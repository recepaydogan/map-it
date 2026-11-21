import { GAME_CONFIG } from "../game-config";

/** Language metadata available to game builds. The active subset is configured per game. */
export interface AppLanguage {
  code: string;
  /** The language's own name for itself. */
  name: string;
}

const LANGUAGE_OPTIONS: AppLanguage[] = [
  { code: "en", name: "English" },
  { code: "zh-Hans", name: "简体中文" },
  { code: "es", name: "Español (España)" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "pt-BR", name: "Português (Brasil)" },
  { code: "ru", name: "Русский" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "it", name: "Italiano" },
  { code: "tr", name: "Türkçe" },
  { code: "pl", name: "Polski" },
  { code: "id", name: "Bahasa Indonesia" },
  { code: "nl", name: "Nederlands" },
  { code: "uk", name: "Українська" },
  { code: "th", name: "ไทย" },
  { code: "es-MX", name: "Español (México)" },
  { code: "es-AR", name: "Español (Argentina)" },
  { code: "es-CL", name: "Español (Chile)" },
  { code: "pt", name: "Português (Portugal)" },
  { code: "zh-Hant", name: "繁體中文" },
  { code: "cs", name: "Čeština" },
  { code: "ro", name: "Română" },
  { code: "hu", name: "Magyar" },
  { code: "da", name: "Dansk" },
  { code: "fi", name: "Suomi" },
  { code: "no", name: "Norsk" },
  { code: "ca", name: "Català" },
];

export const APP_LANGUAGES = GAME_CONFIG.supportedAppLanguages.map((code) => {
  const language = LANGUAGE_OPTIONS.find((option) => option.code === code);
  if (!language) throw new Error(`Unknown app language: ${code}`);
  return language;
});
