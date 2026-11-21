import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { setAppLanguage, useAppLanguage } from "../../i18n/app-language";
import { getLanguageFlag } from "../../i18n/language-flags";
import { APP_LANGUAGES } from "../../i18n/language-order";
import { cn } from "../../lib/cn";
import { getPortalRoot } from "../../lib/portal";

const AppLanguagePicker = ({ variant = "header" }: { variant?: "header" | "settings" }) => {
  const { t } = useTranslation();
  const language = useAppLanguage();
  const current = APP_LANGUAGES.find(({ code }) => code === language);
  const flag = getLanguageFlag(language);
  const label = t("settings.language");

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        type="button"
        data-ow-no-drag
        data-tour={variant === "header" ? "language" : undefined}
        aria-label={variant === "settings" && current ? `${label} · ${current.name}` : label}
        title={variant === "header" ? current?.name : undefined}
        className={cn(
          "flex cursor-pointer items-center justify-center gap-1.5 text-zinc-300 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-accent",
          variant === "header"
            ? "h-10 px-2 hover:bg-white/8"
            : "min-h-9 max-w-52 rounded-[var(--radius-md)] border border-border bg-surface px-2.5 text-[12px]",
        )}
      >
        {flag ? <img src={flag} alt="" aria-hidden="true"
          className="h-auto w-[22px] shrink-0 rounded-[2px] ring-1 ring-black/25" />
          : <Languages size={16} aria-hidden="true" />}
        {variant === "settings" && <span className="truncate">{current?.name}</span>}
        <ChevronDown size={13} className="shrink-0 text-zinc-500" aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={getPortalRoot()}>
        <DropdownMenu.Content
          align="end"
          sideOffset={5}
          collisionBoundary={getPortalRoot()}
          collisionPadding={8}
          aria-label={t("settings.language")}
          className="pointer-events-auto z-[1600] max-h-72 min-w-48 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-xl shadow-black/40 animate-fade-in"
        >
          <DropdownMenu.RadioGroup value={language} onValueChange={setAppLanguage}>
            {APP_LANGUAGES.map((option) => (
              <DropdownMenu.RadioItem
                key={option.code}
                value={option.code}
                data-ow-no-drag
                className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] text-zinc-300 outline-none data-[highlighted]:bg-surface-hover data-[highlighted]:text-white data-[state=checked]:text-white"
              >
                <span className="grid w-4 shrink-0 place-items-center">
                  <DropdownMenu.ItemIndicator><Check size={13} className="text-accent" aria-hidden="true" /></DropdownMenu.ItemIndicator>
                </span>
                <img src={getLanguageFlag(option.code)} alt="" aria-hidden="true"
                  className="h-auto w-5 shrink-0 rounded-[2px] ring-1 ring-black/25" />
                <span>{option.name}</span>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default AppLanguagePicker;
