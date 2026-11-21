import { Check, ChevronDown, MapPin, Search, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import TruncatedText from "../../components/truncated-text";
import { cn } from "../../lib/cn";
import { useDismissable } from "./use-dismissable";

export interface MapSelectOption {
  id: string;
  name: string;
}

interface MapSelectDropdownProps {
  options: MapSelectOption[];
  onSelect: (id: string) => void;
  /** Controlled selection. Omit to let the control remember the last pick. */
  value?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placeholder: string;
  ariaLabel: string;
  searchPlaceholder: string;
  noResultsLabel: string;
  icon?: LucideIcon;
  placement?: "top" | "bottom";
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
}

/** Only lists long enough to need it get a search box. */
const SEARCH_THRESHOLD = 6;

/**
 * Compact pick-one control with a floating, optionally searchable option
 * list. Used for the region jump — the same control the
 * Settings page's dropdowns follow — because a native <select> drops an
 * OS-drawn white popup into the middle of a dark app.
 */
const MapSelectDropdown = ({
  options,
  onSelect,
  value,
  open: controlledOpen,
  onOpenChange,
  placeholder,
  ariaLabel,
  searchPlaceholder,
  noResultsLabel,
  icon: Icon = MapPin,
  placement = "bottom",
  className,
  triggerClassName,
  panelClassName,
}: MapSelectDropdownProps) => {
  const { i18n } = useTranslation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange ?? setLocalOpen;
  const [query, setQuery] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  const selectedId = value === undefined ? lastId : value;
  const current = options.find((option) => option.id === selectedId);
  const searchable = options.length >= SEARCH_THRESHOLD;
  const close = useCallback(() => {
    if (rootRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
    setOpen(false);
    setQuery("");
  }, [setOpen]);
  const normalize = (text: string) => text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase(i18n.language);
  const normalizedQuery = normalize(query.trim());
  const filteredOptions = normalizedQuery
    ? options.filter(({ name }) => normalize(name).includes(normalizedQuery))
    : options;

  useDismissable(open, rootRef, close);

  useEffect(() => {
    if (!open) return;
    if (searchable) searchRef.current?.focus();
    else (rootRef.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')
      ?? rootRef.current?.querySelector<HTMLElement>('[role="option"]'))?.focus();
  }, [open, searchable]);

  const moveOptionFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    const fromInput = event.target === searchRef.current;
    if (key !== "ArrowDown" && key !== "ArrowUp" && (fromInput || (key !== "Home" && key !== "End"))) return;
    const choices = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'));
    if (!choices.length) return;
    const currentIndex = choices.indexOf(document.activeElement as HTMLElement);
    const next = key === "Home" ? 0 : key === "End" ? choices.length - 1 : key === "ArrowDown"
      ? (currentIndex + 1) % choices.length
      : (currentIndex < 0 ? choices.length - 1 : (currentIndex - 1 + choices.length) % choices.length);
    event.preventDefault();
    choices[next]?.focus();
  };

  if (options.length === 0) return null;
  const visibleLabel = current?.name ?? placeholder;
  const triggerLabel = visibleLabel === ariaLabel ? ariaLabel : `${visibleLabel} · ${ariaLabel}`;
  const tabStop = (!searchable ? filteredOptions.find(({ id }) => id === selectedId) : undefined) ?? filteredOptions[0];

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) close();
          else setOpen(true);
        }}
        onKeyDown={(event) => {
          if (open || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
          event.preventDefault();
          setOpen(true);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={triggerLabel}
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface/80 px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none transition-colors hover:bg-surface-hover focus-visible:border-accent",
          triggerClassName,
        )}
      >
        <Icon size={13} className="shrink-0 text-zinc-400" aria-hidden="true" />
        <TruncatedText
          text={visibleLabel}
          wrapperClassName="flex-1"
          className="text-left font-medium"
        />
        <ChevronDown
          size={13}
          className={cn("shrink-0 text-zinc-500 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          data-map-nested-popover
          onKeyDown={moveOptionFocus}
          className={cn(
            "absolute left-0 z-50 flex w-full max-h-64 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-xl shadow-black/40 animate-fade-in",
            placement === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]",
            panelClassName,
          )}
        >
          {searchable && (
            <label className="relative m-1.5 block shrink-0">
              <span className="sr-only">{searchPlaceholder}</span>
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
                aria-hidden="true"
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    close();
                  }
                }}
                placeholder={searchPlaceholder}
                className="h-8 w-full rounded-[var(--radius-sm)] border border-border bg-black/15 pl-8 pr-2.5 text-[11px] text-white outline-none placeholder:text-zinc-500 focus:border-accent/70"
              />
            </label>
          )}
          <div
            role="listbox"
            aria-label={ariaLabel}
            className="min-h-0 flex-1 overflow-y-auto px-1 py-1"
          >
            {filteredOptions.map((option) => {
              const selected = option.id === selectedId;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={option === tabStop ? 0 : -1}
                  onClick={() => {
                    setLastId(option.id);
                    close();
                    onSelect(option.id);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-surface-hover",
                    selected ? "text-white" : "text-zinc-300",
                  )}
                >
                  <span className="grid w-4 shrink-0 place-items-center">
                    {selected && <Check size={13} className="text-accent" aria-hidden="true" />}
                  </span>
                  <TruncatedText text={option.name} wrapperClassName="flex-1" />
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <p className="px-2.5 py-5 text-center text-[11px] text-zinc-400">
                {noResultsLabel}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MapSelectDropdown;
