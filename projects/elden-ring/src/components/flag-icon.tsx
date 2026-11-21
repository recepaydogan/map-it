import BR from "country-flag-icons/react/3x2/BR";
import CN from "country-flag-icons/react/3x2/CN";
import DE from "country-flag-icons/react/3x2/DE";
import ES from "country-flag-icons/react/3x2/ES";
import FR from "country-flag-icons/react/3x2/FR";
import GB from "country-flag-icons/react/3x2/GB";
import IT from "country-flag-icons/react/3x2/IT";
import JP from "country-flag-icons/react/3x2/JP";
import KR from "country-flag-icons/react/3x2/KR";
import MX from "country-flag-icons/react/3x2/MX";
import PL from "country-flag-icons/react/3x2/PL";
import RU from "country-flag-icons/react/3x2/RU";
import TH from "country-flag-icons/react/3x2/TH";
import TW from "country-flag-icons/react/3x2/TW";
import { cn } from "../lib/cn";

/**
 * A small real SVG country flag for the language switcher. Flag EMOJIS are not an
 * option here: Chromium on Windows (and therefore Overwolf) renders regional-
 * indicator emojis as bare letter pairs ("DE"), so we ship actual flag artwork
 * (tree-shaken from country-flag-icons — only the languages we support are bundled).
 */
const FLAGS: Record<string, typeof GB> = { GB, DE, ES, FR, CN, BR, IT, JP, KR, MX, PL, RU, TH, TW };

const FlagIcon = ({ region, className }: { region: string; className?: string }) => {
  const Flag = FLAGS[region];
  if (!Flag) return null;
  return <Flag className={cn("w-5 shrink-0 rounded-[2px] ring-1 ring-black/25", className)} />;
};

export default FlagIcon;
