import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { setAppLanguage, useAppLanguage } from "../../i18n/app-language";
import { getLanguageFlag } from "../../i18n/language-flags";
import { APP_LANGUAGES } from "../../i18n/language-order";
import { cn } from "../../lib/cn";
import { getPortalRoot } from "../../lib/portal";

/** Shared desktop and in-game title-bar language control. */
const AppLanguagePicker = () => {
  const { t } = useTranslation();
  const language = useAppLanguage();
  const [open, setOpen] = useState(false);
  const current = APP_LANGUAGES.find(option => option.code === language);
  const flag = getLanguageFlag(language);
  return <DropdownMenu.Root modal={false} open={open} onOpenChange={setOpen}>
    <DropdownMenu.Trigger data-ow-no-drag data-tour="language" aria-label={t("settings.language")} title={current?.name}
      className="flex h-10 shrink-0 cursor-pointer items-center gap-1 px-1.5 text-zinc-300 outline-none transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:bg-surface-hover">
      {flag ? <img src={flag} alt="" aria-hidden="true" className="h-auto w-[22px] shrink-0 rounded-[2px] ring-1 ring-black/25" /> : <Languages size={16} aria-hidden="true" />}
      <ChevronDown size={13} className="text-zinc-500" aria-hidden="true" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal container={getPortalRoot()}>
      <DropdownMenu.Content aria-label={t("settings.language")} align="end" sideOffset={6} collisionBoundary={getPortalRoot()} collisionPadding={8}
        className="pointer-events-auto z-[1600] max-h-[min(288px,var(--radix-dropdown-menu-content-available-height))] min-w-44 max-w-[var(--radix-dropdown-menu-content-available-width)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-xl shadow-black/40 animate-fade-in">
        <DropdownMenu.RadioGroup value={language} onValueChange={setAppLanguage}>
          {APP_LANGUAGES.map(option => {
            const selected = language === option.code;
            const optionFlag = getLanguageFlag(option.code);
            return <DropdownMenu.RadioItem key={option.code} value={option.code} textValue={option.name}
              className={cn("flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] outline-none transition-colors data-[highlighted]:bg-surface-hover", selected ? "text-white" : "text-zinc-300")}>
              <span className="grid w-4 shrink-0 place-items-center">{selected && <Check size={13} className="text-accent" aria-hidden="true" />}</span>
              {optionFlag && <img src={optionFlag} alt="" aria-hidden="true" className="h-auto w-5 shrink-0 rounded-[2px] ring-1 ring-black/25" />}
              <span>{option.name}</span>
            </DropdownMenu.RadioItem>;
          })}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
};
export default AppLanguagePicker;
