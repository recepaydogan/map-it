import ad from "flag-icons/flags/4x3/ad.svg";
import ar from "flag-icons/flags/4x3/ar.svg";
import br from "flag-icons/flags/4x3/br.svg";
import cl from "flag-icons/flags/4x3/cl.svg";
import cn from "flag-icons/flags/4x3/cn.svg";
import cz from "flag-icons/flags/4x3/cz.svg";
import de from "flag-icons/flags/4x3/de.svg";
import dk from "flag-icons/flags/4x3/dk.svg";
import es from "flag-icons/flags/4x3/es.svg";
import fi from "flag-icons/flags/4x3/fi.svg";
import fr from "flag-icons/flags/4x3/fr.svg";
import gb from "flag-icons/flags/4x3/gb.svg";
import hu from "flag-icons/flags/4x3/hu.svg";
import id from "flag-icons/flags/4x3/id.svg";
import it from "flag-icons/flags/4x3/it.svg";
import jp from "flag-icons/flags/4x3/jp.svg";
import kr from "flag-icons/flags/4x3/kr.svg";
import mx from "flag-icons/flags/4x3/mx.svg";
import nl from "flag-icons/flags/4x3/nl.svg";
import no from "flag-icons/flags/4x3/no.svg";
import pl from "flag-icons/flags/4x3/pl.svg";
import pt from "flag-icons/flags/4x3/pt.svg";
import ro from "flag-icons/flags/4x3/ro.svg";
import ru from "flag-icons/flags/4x3/ru.svg";
import th from "flag-icons/flags/4x3/th.svg";
import tr from "flag-icons/flags/4x3/tr.svg";
import tw from "flag-icons/flags/4x3/tw.svg";
import ua from "flag-icons/flags/4x3/ua.svg";

export const LANGUAGE_FLAGS: Record<string, string> = {
  "es-AR": ar,
  ca: ad,
  "zh-Hant": tw,
  "zh-Hans": cn,
  cs: cz,
  da: dk,
  de,
  en: gb,
  es,
  "es-CL": cl,
  "es-MX": mx,
  fi,
  fr,
  hu,
  id,
  it,
  ja: jp,
  ko: kr,
  nl,
  no,
  pl,
  pt,
  "pt-BR": br,
  ro,
  ru,
  th,
  tr,
  uk: ua,
};

export const getLanguageFlag = (language: string) =>
  LANGUAGE_FLAGS[language];
