import * as RD from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getPortalRoot } from "../lib/portal";
import { cn } from "../lib/cn";

export interface CategoryOption {
  key: string;
  label: string;
  /** Leading Lucide glyph (categories). */
  icon?: LucideIcon;
  /** Leading colour swatch (rarities) — takes precedence over `icon`. */
  color?: string;
  /** Trailing count, right-aligned. Omit to hide. */
  count?: number;
}

interface CategoryDropdownProps {
  value: string;
  options: CategoryOption[];
  onChange: (key: string) => void;
  /** Draw a thin divider after this option's key (e.g. a leading "All" row). */
  dividerAfter?: string;
  ariaLabel?: string;
  className?: string;
}

/** The leading slot: a colour swatch (rarity) or a Lucide glyph (category), tinted with the
 *  live accent when it's the active/selected row. */
const Lead = ({ option, active }: { option: CategoryOption; active: boolean }) => {
  if (option.color) {
    return (
      <span
        aria-hidden="true"
        className="h-3 w-3 shrink-0 rounded-[3px] border border-white/15"
        style={{ backgroundColor: option.color }}
      />
    );
  }
  if (option.icon) {
    const Icon = option.icon;
    return <Icon size={15} className={cn("shrink-0", active ? "text-accent" : "text-zinc-500")} aria-hidden="true" />;
  }
  return null;
};

/**
 * The app's category/rarity/type picker — one Radix dropdown so every Archive filter (Elden
 * Ring and Nightreign alike) shares identical chrome. A row is a leading glyph or colour
 * swatch, a label, an optional right-aligned count, and a check on the selection. Accent
 * tints follow the surrounding `data-game` (Erdtree gold under ER, spectral cyan under NR),
 * so the same component reads correctly on both sides of the Archive. Portals above the
 * overlay (z-1600 > the overlay's z-1500) so the menu is never clipped.
 */
const CategoryDropdown = ({ value, options, onChange, dividerAfter, ariaLabel, className }: CategoryDropdownProps) => {
  const { i18n } = useTranslation();
  const active = options.find((o) => o.key === value) ?? options[0];
  if (!active) return null;
  return (
    <RD.Root>
      <RD.Trigger
        aria-label={ariaLabel}
        className={cn(
          "flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface/80 px-3 py-2 text-left text-[13px] text-zinc-100 outline-none transition-colors hover:bg-surface-hover focus-visible:border-accent cursor-pointer data-[state=open]:border-accent/60",
          className,
        )}
      >
        <Lead option={active} active />
        <span className="min-w-0 flex-1 truncate font-medium">{active.label}</span>
        {active.count != null && (
          <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">{active.count.toLocaleString(i18n.language)}</span>
        )}
        <ChevronDown size={14} className="shrink-0 text-zinc-500" aria-hidden="true" />
      </RD.Trigger>

      <RD.Portal container={getPortalRoot()}>
        <RD.Content
          align="start"
          sideOffset={6}
          // Don't re-focus the trigger on close: Chromium leaves a lingering focus ring after a
          // mouse pick, which reads as a stuck border. Keyboard focus while open is unaffected.
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="z-[1600] max-h-[60vh] w-[var(--radix-dropdown-menu-trigger-width)] min-w-48 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-xl shadow-black/50 animate-fade-in"
        >
          {options.map((o) => {
            const selected = o.key === value;
            return (
              <div key={o.key}>
                <RD.Item
                  onSelect={() => onChange(o.key)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] outline-none transition-colors data-[highlighted]:bg-surface-hover",
                    selected ? "text-white" : "text-zinc-300",
                  )}
                >
                  <Lead option={o} active={selected} />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.count != null && (
                    <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">{o.count.toLocaleString(i18n.language)}</span>
                  )}
                  {selected && <Check size={13} className="shrink-0 text-accent" aria-hidden="true" />}
                </RD.Item>
                {dividerAfter === o.key && <div className="my-1 h-px bg-border" aria-hidden="true" />}
              </div>
            );
          })}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
};

export default CategoryDropdown;
