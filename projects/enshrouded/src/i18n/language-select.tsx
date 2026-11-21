import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { getPortalRoot } from "../lib/portal";
import { setAppLanguage, useAppLanguage } from "./app-language";
import { APP_LANGUAGES } from "./language-order";

/** Shared language preference; the scoped portal keeps its menu off the ad rail. */
export default function LanguageSelect({ id, className }: { id?: string; className?: string }) {
  const { t } = useTranslation();
  const language = useAppLanguage();
  const current = APP_LANGUAGES.find(option => option.code === language) ?? APP_LANGUAGES[0];
  if (APP_LANGUAGES.length < 2) return null;

  return <DropdownMenu.Root modal={false}>
    <DropdownMenu.Trigger id={id} type="button" aria-label={`${t("settings.language")}: ${current.name}`}
      className={cn("flex min-w-44 cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-white outline-none hover:bg-surface-hover focus-visible:border-accent", className)}>
      <Languages size={15} className="shrink-0 text-zinc-400" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-left" lang={current.code}>{current.name}</span>
      <ChevronDown size={14} className="shrink-0 text-zinc-400" aria-hidden="true" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal container={getPortalRoot()}>
      <DropdownMenu.Content align="end" sideOffset={6} collisionBoundary={getPortalRoot()} collisionPadding={8}
        aria-label={t("settings.language")}
        className="pointer-events-auto z-[1600] max-h-[min(280px,var(--radix-dropdown-menu-content-available-height))] min-w-[var(--radix-dropdown-menu-trigger-width)] max-w-[var(--radix-dropdown-menu-content-available-width)] overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-xl shadow-black/40">
        <DropdownMenu.RadioGroup value={language} onValueChange={setAppLanguage}>
          {APP_LANGUAGES.map(option => <DropdownMenu.RadioItem key={option.code} value={option.code} textValue={option.name}
            className={cn("flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-hover",
              option.code === language ? "bg-surface-hover text-white" : "text-zinc-300")}>
            <span className="flex-1" lang={option.code}>{option.name}</span>
            {option.code === language && <Check size={14} className="text-accent" aria-hidden="true" />}
          </DropdownMenu.RadioItem>)}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
