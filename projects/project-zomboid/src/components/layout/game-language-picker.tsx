import { Check, ChevronDown, Languages } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  setGameContentLanguage,
  useGameContentLanguage,
} from "../../game-content/game-content-language";
import { getGameLanguageFlag } from "../../game-content/game-language-flags";
import { useGameLanguages } from "./use-game-languages";
import { cn } from "../../lib/cn";

const GameLanguagePicker = () => {
  const { t } = useTranslation();
  const currentCode = useGameContentLanguage();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const languages = useGameLanguages();
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  const current = languages.find(({ code }) => code === currentCode);
  const currentFlag = getGameLanguageFlag(currentCode);

  return (
    <div ref={rootRef} className="relative h-full">
      <button
        type="button"
        data-tour="language"
        onClick={() => setOpen((value) => !value)}
        aria-label={t("gameLanguage.label")}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={current?.name ?? t("gameLanguage.label")}
        className="flex h-full cursor-pointer items-center gap-1 px-1.5 text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        {currentFlag ? (
          <img
            src={currentFlag}
            alt=""
            className="h-auto w-[22px] shrink-0 rounded-[2px] ring-1 ring-black/25"
            aria-hidden="true"
          />
        ) : (
          <Languages size={16} aria-hidden="true" />
        )}
        <ChevronDown size={13} className="text-zinc-500" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t("gameLanguage.label")}
          className="absolute right-0 top-[calc(100%+6px)] z-[1600] max-h-72 min-w-44 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-xl shadow-black/40 animate-fade-in"
        >
          {languages.map((language) => {
            const selected = language.code === currentCode;
            const flag = getGameLanguageFlag(language.code);
            return (
              <button
                key={language.code}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setGameContentLanguage(language.code);
                  close();
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover",
                  selected ? "text-white" : "text-zinc-300",
                )}
              >
                <span className="grid w-4 shrink-0 place-items-center">
                  {selected && <Check size={13} className="text-accent" aria-hidden="true" />}
                </span>
                {flag && (
                  <img
                    src={flag}
                    alt=""
                    className="h-auto w-5 shrink-0 rounded-[2px] ring-1 ring-black/25"
                    aria-hidden="true"
                  />
                )}
                <span>{language.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GameLanguagePicker;
