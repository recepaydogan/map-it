import { useSyncExternalStore } from "react";
import { changeI18nLanguage } from "./index";
import { DEFAULT_LANGUAGE, normalizeLanguage } from "./language-policy";
export { DEFAULT_LANGUAGE, normalizeLanguage } from "./language-policy";

/**
 * The UI language, shared by every window through localStorage: a pick in the
 * desktop window's title bar switches the in-game overlay too (the `storage`
 * event carries it across).
 */
export const APP_LANGUAGE_STORAGE_KEY = "gm:app-language";
const CHANGE_EVENT = "gm:app-language-change";

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
    void changeI18nLanguage(currentLanguage);
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
  currentLanguage = normalizeLanguage(language);
  localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, currentLanguage);
  void changeI18nLanguage(currentLanguage);
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const useAppLanguage = () =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
