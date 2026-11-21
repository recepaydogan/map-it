import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Languages } from "lucide-react";
import FlagIcon from "../../flag-icon";
import { useLocale } from "../../../i18n/use-locale";
import { cn } from "../../../lib/cn";
import MobileNavRow from "./mobile-nav-row";

/**
 * Language picker for the drawer. The title bar's version is a Radix dropdown,
 * which is wrong here twice over: a portalled menu inside an already-portalled
 * sheet has to fight it for stacking order, and a floating list is a poor target
 * on a phone. So the drawer expands the languages INLINE — full-width rows, each
 * a real touch target, with the sheet doing the scrolling.
 */
const MobileNavLanguage = () => {
  const { t } = useTranslation();
  const { language, setLanguage, languages } = useLocale();
  const [open, setOpen] = useState(false);
  const current = languages.find((entry) => entry.code === language) ?? languages[0];

  return (
    <>
      <MobileNavRow
        icon={Languages}
        label={t("settings.language")}
        onClick={() => setOpen((value) => !value)}
        trailing={
          <span className="flex shrink-0 items-center gap-2 text-[13px] text-zinc-400">
            <FlagIcon region={current.region} className="w-[20px]" />
            <ChevronDown
              size={15}
              className={cn("text-zinc-500 transition-transform", open && "rotate-180")}
              aria-hidden="true"
            />
          </span>
        }
      />

      {open && (
        <ul className="ml-4 flex flex-col gap-0.5 border-l border-border pl-2 animate-fade-in">
          {languages.map((entry) => {
            const selected = entry.code === language;
            return (
              <li key={entry.code}>
                <button
                  type="button"
                  onClick={() => {
                    setLanguage(entry.code);
                    setOpen(false);
                  }}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2.5 rounded-[var(--radius-md)] px-3 text-left text-[14px] transition-colors cursor-pointer",
                    selected ? "text-white" : "text-zinc-300 hover:bg-white/[0.06] active:bg-white/[0.06]",
                  )}
                >
                  <FlagIcon region={entry.region} className="w-[20px] shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{entry.endonym}</span>
                  {selected && <Check size={15} className="shrink-0 text-accent" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
};

export default MobileNavLanguage;
