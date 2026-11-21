import br from "flag-icons/flags/4x3/br.svg";
import cn from "flag-icons/flags/4x3/cn.svg";
import es from "flag-icons/flags/4x3/es.svg";
import fr from "flag-icons/flags/4x3/fr.svg";
import gb from "flag-icons/flags/4x3/gb.svg";
import ind from "flag-icons/flags/4x3/in.svg";

export const LANGUAGE_FLAGS: Readonly<Record<string, string>> = {
  en: gb,
  "zh-Hans": cn,
  "hi-IN": ind,
  es,
  fr,
  "pt-BR": br,
};

export const getLanguageFlag = (language: string) =>
  LANGUAGE_FLAGS[language];
