import { useSyncExternalStore } from "react";
import i18n from "../i18n";

const STORAGE_KEY = "pzim:game-content-language";
const CHANGE_EVENT = "pzim:game-content-language-change";
const DEFAULT_LANGUAGE = "en";
const normalizeLanguage = (language: string | null) =>
  !language || language === "strew" ? DEFAULT_LANGUAGE : language;

const getStoredLanguage = () =>
  typeof window === "undefined"
    ? DEFAULT_LANGUAGE
    : normalizeLanguage(localStorage.getItem(STORAGE_KEY));

let currentLanguage = getStoredLanguage();

const getSnapshot = () => currentLanguage;
const getServerSnapshot = () => DEFAULT_LANGUAGE;

const subscribe = (listener: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
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

export const setGameContentLanguage = (language: string) => {
  currentLanguage = normalizeLanguage(language);
  localStorage.setItem(STORAGE_KEY, currentLanguage);
  void i18n.changeLanguage(currentLanguage);
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const useGameContentLanguage = () =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
