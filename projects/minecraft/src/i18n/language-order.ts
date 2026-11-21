import { GAME_GUIDE_LANGUAGE_SOURCE } from "../game-config.ts";

/** Languages in the picker must have both an app locale and a game language. */
export interface AppLanguage {
  code: string;
  /** The language's own name for itself. */
  name: string;
}

const appLanguages: AppLanguage[] = [
  { code: "en", name: "English" },
  { code: "zh-Hans", name: "简体中文" },
  { code: "hi-IN", name: "हिंदी" },
  { code: "es", name: "Español (España)" },
  { code: "fr", name: "Français" },
  { code: "pt-BR", name: "Português (Brasil)" },
];

export const APP_LANGUAGES: AppLanguage[] = appLanguages.filter(({ code }) =>
  Object.hasOwn(GAME_GUIDE_LANGUAGE_SOURCE.localeCodes, code));
