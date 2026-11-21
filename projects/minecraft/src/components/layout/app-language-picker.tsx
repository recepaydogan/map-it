import { Check, ChevronDown, Languages } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { setAppLanguage, useAppLanguage } from "../../i18n/app-language";
import { getLanguageFlag } from "../../i18n/language-flags";
import { APP_LANGUAGES } from "../../i18n/language-order";
import { cn } from "../../lib/cn";

/** Shared language switch for the title bar and Settings. */
const AppLanguagePicker = ({ variant = "header" }: { variant?: "header" | "settings" }) => {
  const { t } = useTranslation();
  const currentCode = useAppLanguage();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
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

  const current = APP_LANGUAGES.find(({ code }) => code === currentCode);
  const currentFlag = getLanguageFlag(currentCode);

  return (
    <div ref={rootRef} className={cn("relative", variant === "header" && "h-full")}>
      <button
        type="button"
        data-tour={variant === "header" ? "language" : undefined}
        onClick={() => setOpen((value) => !value)}
        aria-label={t("language.label")}
        aria-expanded={open}
        title={current?.name ?? t("language.label")}
        className={cn(
          "flex cursor-pointer items-center gap-1.5 text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-2px]",
          variant === "header"
            ? "h-full px-1.5"
            : "h-9 min-w-40 rounded-[var(--radius-md)] border border-border bg-surface px-2.5 text-[12px]",
        )}
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
        {variant === "settings" && <span className="min-w-0 flex-1 truncate text-left">{current?.name ?? currentCode}</span>}
        <ChevronDown size={13} className={cn("shrink-0 text-zinc-500 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="group"
          aria-label={t("language.label")}
          className="absolute right-0 top-[calc(100%+6px)] z-[1600] max-h-72 min-w-44 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-xl shadow-black/40 animate-fade-in"
        >
          {APP_LANGUAGES.map((language) => {
            const selected = language.code === currentCode;
            const flag = getLanguageFlag(language.code);
            return (
              <button
                key={language.code}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setAppLanguage(language.code);
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

export default AppLanguagePicker;
