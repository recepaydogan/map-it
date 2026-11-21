import gb from "../assets/flags/gb.svg";
import cn from "../assets/flags/cn.svg";
import tw from "../assets/flags/tw.svg";
import de from "../assets/flags/de.svg";
import fr from "../assets/flags/fr.svg";
import es from "../assets/flags/es.svg";
import mx from "../assets/flags/mx.svg";
import it from "../assets/flags/it.svg";
import br from "../assets/flags/br.svg";
import pt from "../assets/flags/pt.svg";
import ru from "../assets/flags/ru.svg";
import jp from "../assets/flags/jp.svg";
import kr from "../assets/flags/kr.svg";
import th from "../assets/flags/th.svg";
import vn from "../assets/flags/vn.svg";

const LANGUAGE_FLAGS: Record<string, string> = {
  en: gb, "zh-Hans": cn, "zh-Hant": tw, de, fr, es, "es-419": mx,
  it, "pt-BR": br, pt, ru, ja: jp, ko: kr, th, vi: vn,
};

export const getLanguageFlag = (language: string) => LANGUAGE_FLAGS[language];
