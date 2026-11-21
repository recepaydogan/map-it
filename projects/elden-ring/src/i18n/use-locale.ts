import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "./config";
import { setLanguage } from "./index";

/**
 * Current UI language + the setter + the supported-language list. Backs the
 * language switcher and anything that needs to branch on locale. Re-renders on a
 * language change (via react-i18next's `useTranslation`).
 */
export const useLocale = () => {
  const { i18n } = useTranslation();
  return {
    /** Active language code (e.g. "en", "zh-Hans"). */
    language: i18n.resolvedLanguage ?? i18n.language,
    setLanguage,
    languages: SUPPORTED_LANGUAGES,
  };
};
