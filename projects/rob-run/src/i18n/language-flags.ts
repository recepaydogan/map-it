import br from "flag-icons/flags/4x3/br.svg";
import cn from "flag-icons/flags/4x3/cn.svg";
import de from "flag-icons/flags/4x3/de.svg";
import es from "flag-icons/flags/4x3/es.svg";
import fr from "flag-icons/flags/4x3/fr.svg";
import gb from "flag-icons/flags/4x3/gb.svg";
import kr from "flag-icons/flags/4x3/kr.svg";
import mx from "flag-icons/flags/4x3/mx.svg";
import tw from "flag-icons/flags/4x3/tw.svg";

const LANGUAGE_FLAGS: Record<string, string> = {
  en: gb,
  de,
  es,
  "es-MX": mx,
  fr,
  ko: kr,
  "pt-BR": br,
  "zh-Hans": cn,
  "zh-Hant": tw,
};

export const getLanguageFlag = (language: string): string | undefined =>
  LANGUAGE_FLAGS[language];
