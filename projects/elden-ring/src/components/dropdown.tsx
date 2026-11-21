import * as RD from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { getPortalRoot } from "../lib/portal";
import { cn } from "../lib/cn";

export interface DropdownOption {
  value: string;
  label: string;
  /** Optional leading element (e.g. a flag) shown before the label. */
  icon?: ReactNode;
  /** Key of the `DropdownSection` this option belongs to. Ignored unless the
   *  caller also passes `sections`. */
  section?: string;
}

export interface DropdownSection {
  key: string;
  /** Heading above the run of options, in the app's engraved caption style. */
  label: string;
  /** Re-themes the section's rows to a game accent (`data-game`), so a menu that
   *  spans both games reads the way the title-bar tabs do — Erdtree gold on the
   *  Elden Ring side, spectral cyan on the Nightreign one. */
  game?: string;
}

interface DropdownProps {
  /** The selected option's value, or `null` for "nothing here is selected" —
   *  used by menus whose rows are destinations rather than settings, so the list
   *  wears no tick while the app is somewhere else entirely. */
  value: string | null;
  options: DropdownOption[];
  onChange: (value: string) => void;
  icon?: LucideIcon;
  /** Small label shown before the current value. */
  caption?: string;
  className?: string;
  /** Custom trigger element; when provided it replaces the default styled pill
   *  (rendered via Radix `asChild`, so it must be a single focusable element). */
  trigger?: ReactNode;
  /** Menu alignment relative to the trigger. */
  align?: "start" | "center" | "end";
  /** Group the options under headings. Sections render in the order given, each
   *  holding the options whose `section` matches its `key`; options with no
   *  match are dropped. Omit for a flat list (the default). */
  sections?: DropdownSection[];
}

/**
 * Shared dropdown built on Radix. Replaces native <select> everywhere (the OS
 * paints native option lists outside the React DOM — unstyleable on dark
 * themes). One wrapper so every picker shares chrome. Portals into the non-ads
 * region, never document.body.
 */
const Dropdown = ({
  value,
  options,
  onChange,
  icon: Icon,
  caption,
  className,
  trigger,
  align = "start",
  sections,
}: DropdownProps) => {
  const current = options.find((o) => o.value === value);

  const renderItem = (option: DropdownOption) => {
    const selected = option.value === value;
    return (
      <RD.Item
        key={option.value}
        onSelect={() => onChange(option.value)}
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] outline-none transition-colors data-[highlighted]:bg-surface-hover",
          selected ? "text-white" : "text-zinc-300",
        )}
      >
        <span className="grid w-4 place-items-center">
          {selected && <Check size={13} className="text-accent" aria-hidden="true" />}
        </span>
        {option.icon}
        {option.label}
      </RD.Item>
    );
  };

  return (
    <RD.Root>
      {trigger ? (
        <RD.Trigger asChild>{trigger}</RD.Trigger>
      ) : (
        <RD.Trigger
          className={cn(
            // min-w-0 + a truncating label so the pill can give way inside a
            // cramped row (the phone map toolbar) instead of pushing its
            // neighbours onto a second line. No effect where there's room.
            "flex min-w-0 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface/80 px-3 py-1.5 text-[13px] text-zinc-100 outline-none transition-colors hover:bg-surface-hover focus-visible:border-accent cursor-pointer",
            className,
          )}
        >
          {Icon && <Icon size={14} className="shrink-0 text-zinc-400" aria-hidden="true" />}
          {caption && <span className="shrink-0 text-zinc-500">{caption}</span>}
          <span className="min-w-0 truncate font-medium">{current?.label ?? value}</span>
          <ChevronDown size={14} className="shrink-0 text-zinc-500" aria-hidden="true" />
        </RD.Trigger>
      )}

      <RD.Portal container={getPortalRoot()}>
        <RD.Content
          align={align}
          sideOffset={6}
          // Don't return focus to the trigger on close: after a mouse pick Chromium
          // paints a lingering :focus-visible ring on it, which reads as a stuck
          // border. Keyboard users still get focus while the menu is open.
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="z-[1600] max-h-72 min-w-44 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-xl shadow-black/40 animate-fade-in"
        >
          {sections
            ? sections.map((section, index) => {
                const rows = options.filter((option) => option.section === section.key);
                if (rows.length === 0) return null;
                return (
                  <RD.Group key={section.key} data-game={section.game}>
                    {index > 0 && <div className="my-1 h-px bg-border" aria-hidden="true" />}
                    <RD.Label className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                      {section.label}
                    </RD.Label>
                    {rows.map(renderItem)}
                  </RD.Group>
                );
              })
            : options.map(renderItem)}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
};

export default Dropdown;
