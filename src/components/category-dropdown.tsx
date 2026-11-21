import { contentUrl } from "../lib/content-url";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { getPortalRoot } from "../lib/portal";

export interface CategoryOption {
  key: string;
  label: string;
  labelContent?: ReactNode;
  icon?: LucideIcon;
  image?: string;
  color?: string;
  count?: number;
}

interface CategoryDropdownProps {
  id?: string;
  triggerClassName?: string;
  contentClassName?: string;
  value: string;
  options: CategoryOption[];
  onChange: (key: string) => void;
  ariaLabel: string;
  dividerAfter?: string;
}

const OptionLead = ({ option, active }: { option: CategoryOption; active: boolean }) => {
  if (option.image) {
    return <img src={contentUrl(`${option.image}`)} alt="" className="size-6 shrink-0 rounded-[var(--radius-sm)] object-contain" />;
  }
  if (option.color) {
    return <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-[3px] border border-white/15" style={{ backgroundColor: option.color }} />;
  }
  if (!option.icon) return null;
  const Icon = option.icon;
  return <Icon size={15} className={cn("shrink-0", active ? "text-accent" : "text-zinc-500")} aria-hidden="true" />;
};

/** Archive-style filter shared by category, grade, and item-type pickers. */
const CategoryDropdown = ({ id, triggerClassName, contentClassName, value, options, onChange, ariaLabel, dividerAfter }: CategoryDropdownProps) => {
  const { i18n } = useTranslation();
  const current = options.find((option) => option.key === value) ?? options[0];
  if (!current) return null;

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        id={id}
        aria-label={`${ariaLabel}: ${current.label}`}
        className={cn("group flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface/80 px-3 py-2 text-left text-[13px] text-zinc-100 outline-none transition-colors hover:bg-surface-hover focus-visible:border-accent data-[state=open]:border-accent/60", triggerClassName)}
      >
        <OptionLead option={current} active />
        <span className="min-w-0 flex-1 truncate font-medium">{current.labelContent ?? current.label}</span>
        {current.count !== undefined && <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">{current.count.toLocaleString(i18n.language)}</span>}
        <ChevronDown size={14} className="shrink-0 text-zinc-500 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal container={getPortalRoot()}>
        <DropdownMenu.Content
          aria-label={ariaLabel}
          align="start"
          sideOffset={6}
          collisionBoundary={getPortalRoot()}
          collisionPadding={8}
          className={cn("pointer-events-auto z-[1600] max-h-[min(280px,40vh,var(--radix-dropdown-menu-content-available-height))] w-[var(--radix-dropdown-menu-trigger-width)] min-w-0 max-w-[var(--radix-dropdown-menu-content-available-width)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-xl shadow-black/50 animate-fade-in", contentClassName)}
        >
          <DropdownMenu.RadioGroup value={value} onValueChange={onChange}>
            {options.map((option) => {
              const selected = option.key === value;
              return (
                <div key={option.key}>
                  <DropdownMenu.RadioItem
                    value={option.key}
                    textValue={option.label}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] outline-none transition-colors data-[highlighted]:bg-surface-hover",
                      selected ? "bg-accent-soft text-white" : "text-zinc-300",
                    )}
                  >
                    <OptionLead option={option} active={selected} />
                    <span className="min-w-0 flex-1 truncate">{option.labelContent ?? option.label}</span>
                    {option.count !== undefined && <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">{option.count.toLocaleString(i18n.language)}</span>}
                    {selected && <Check size={13} className="shrink-0 text-accent" aria-hidden="true" />}
                  </DropdownMenu.RadioItem>
                  {dividerAfter === option.key && <div className="my-1 h-px bg-border" aria-hidden="true" />}
                </div>
              );
            })}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default CategoryDropdown;
