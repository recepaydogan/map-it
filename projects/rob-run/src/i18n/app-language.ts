import { useSyncExternalStore } from "react";
import i18n from "./index";
import { APP_LANGUAGES } from "./language-order";
import { track } from "../services/optional-usage";

/**
 * The UI language, shared by every window through localStorage: a pick in the
 * desktop window's title bar switches the in-game overlay too (the `storage`
 * event carries it across).
 */
export const APP_LANGUAGE_STORAGE_KEY = "gm:app-language";
const CHANGE_EVENT = "gm:app-language-change";
export const DEFAULT_LANGUAGE = "en";

export const normalizeLanguage = (language: string | null | undefined) =>
  language && APP_LANGUAGES.some(({ code }) => code === language) ? language : DEFAULT_LANGUAGE;

const getStoredLanguage = () =>
  typeof window === "undefined"
    ? DEFAULT_LANGUAGE
    : normalizeLanguage(localStorage.getItem(APP_LANGUAGE_STORAGE_KEY));

let currentLanguage = getStoredLanguage();

const getSnapshot = () => currentLanguage;
const getServerSnapshot = () => DEFAULT_LANGUAGE;

const subscribe = (listener: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== APP_LANGUAGE_STORAGE_KEY) return;
    currentLanguage = normalizeLanguage(event.newValue);
    void i18n.changeLanguage(currentLanguage);
    listener();
  };
  const onChange = () => {
    currentLanguage = getStoredLanguage();
    listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
};

export const setAppLanguage = (language: string) => {
  const from = currentLanguage;
  const to = normalizeLanguage(language);
  if (from === to) return;
  currentLanguage = to;
  localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, currentLanguage);
  void i18n.changeLanguage(currentLanguage);
  window.dispatchEvent(new Event(CHANGE_EVENT));
  track("LANGUAGE_CHANGED", { from, to });
};

export const useAppLanguage = () =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
