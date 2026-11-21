import { Check, MapPin, Search, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import TruncatedText from "../../components/truncated-text";
import { cn } from "../../lib/cn";
import { useDismissable } from "./use-dismissable";
import MapDropdownTrigger from "../../components/map-dropdown-trigger";

export interface MapSelectOption {
  id: string;
  name: string;
  count?: number;
  disabled?: boolean;
}

interface MapSelectDropdownProps {
  options: MapSelectOption[];
  onSelect: (id: string) => void;
  /** Controlled selection. Omit to let the control remember the last pick. */
  value?: string;
  placeholder: string;
  ariaLabel: string;
  searchPlaceholder: string;
  noResultsLabel: string;
  icon?: LucideIcon;
  iconClassName?: string;
  placement?: "top" | "bottom";
  className?: string;
  triggerClassName?: string;
  searchable?: boolean;
}

/** Only lists long enough to need it get a search box. */
const SEARCH_THRESHOLD = 6;

/**
 * Compact pick-one control with a floating, optionally searchable option
 * list. Used for the region jump and the map picker — the same control the
 * Settings page's dropdowns follow — because a native <select> drops an
 * OS-drawn white popup into the middle of a dark app.
 */
const MapSelectDropdown = ({
  options,
  onSelect,
  value,
  placeholder,
  ariaLabel,
  searchPlaceholder,
  noResultsLabel,
  icon: Icon = MapPin,
  iconClassName,
  placement = "bottom",
  className,
  triggerClassName,
  searchable: searchEnabled = true,
}: MapSelectDropdownProps) => {
  const { i18n } = useTranslation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  const selectedId = value === undefined ? lastId : value;
  const current = options.find((option) => option.id === selectedId);
  const searchable = searchEnabled && options.length >= SEARCH_THRESHOLD;
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);
  const closeAndFocus = useCallback(() => { close(); triggerRef.current?.focus(); }, [close]);
  const normalize = (text: string) => text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase(i18n.language);
  const normalizedQuery = normalize(query.trim());
  const filteredOptions = normalizedQuery
    ? options.filter(({ name }) => normalize(name).includes(normalizedQuery))
    : options;

  useDismissable(open, rootRef, close, undefined, closeAndFocus);

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  useLayoutEffect(() => {
    if (!open) return;
    const updateBounds = () => {
      const trigger = triggerRef.current?.getBoundingClientRect(), popover = popoverRef.current;
      if (!trigger || !popover) return;
      const below = window.innerHeight - trigger.bottom - 8, above = trigger.top - 8;
      const showBelow = placement === "bottom" ? below >= 192 || below >= above : !(above >= 192 || above >= below);
      popover.style.maxHeight = `${Math.max(0, Math.min(192, (showBelow ? below : above) - 6))}px`;
      popover.style.top = showBelow ? "calc(100% + 6px)" : "";
      popover.style.bottom = showBelow ? "" : "calc(100% + 6px)";
    };
    updateBounds();
    window.addEventListener("resize", updateBounds);
    window.addEventListener("scroll", updateBounds, true);
    return () => {
      window.removeEventListener("resize", updateBounds);
      window.removeEventListener("scroll", updateBounds, true);
    };
  }, [open, placement]);

  if (options.length === 0) return null;

  return (
    <div ref={rootRef} className={cn("relative", className)} onKeyDown={event => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      if ((event.key === "Home" || event.key === "End") && event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      if (!open) setOpen(true);
      requestAnimationFrame(() => {
        const choices = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]:not(:disabled)') ?? [])];
        if (!choices.length) return;
        const currentIndex = choices.findIndex(choice => choice === document.activeElement);
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1
          : event.key === "ArrowDown" ? (currentIndex + 1) % choices.length
            : currentIndex < 0 ? choices.length - 1 : (currentIndex - 1 + choices.length) % choices.length;
        choices[nextIndex]?.focus();
      });
    }}>
      <MapDropdownTrigger
        ref={triggerRef}
        icon={Icon}
        label={current ? <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{current.name}</span>
          {current.count !== undefined && <span className="shrink-0 text-[11px] tabular-nums text-subtle group-hover:text-inherit">{current.count}</span>}
        </span> : placeholder}
        open={open}
        onClick={() => {
          if (open) close();
          else setOpen(true);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-description={current?.name}
        iconClassName={iconClassName}
        className={triggerClassName}
      />

      {open && (
        <div
          ref={popoverRef}
          data-map-nested-popover
          className="absolute inset-x-0 z-50 flex max-h-48 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-xl shadow-black/40 animate-fade-in"
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
                  aria-disabled={option.disabled || undefined}
                  disabled={option.disabled}
                  onClick={() => {
                    setLastId(option.id);
                    closeAndFocus();
                    onSelect(option.id);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-surface-hover",
                    selected ? "text-white" : "text-zinc-300",
                    option.disabled && "cursor-not-allowed opacity-45 hover:bg-transparent",
                  )}
                >
                  <span className="grid w-4 shrink-0 place-items-center">
                    {selected && <Check size={13} className="text-accent" aria-hidden="true" />}
                  </span>
                  <TruncatedText text={option.name} wrapperClassName="flex-1" />
                  {option.count !== undefined && <span className="shrink-0 text-[11px] tabular-nums text-subtle">{option.count}</span>}
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
