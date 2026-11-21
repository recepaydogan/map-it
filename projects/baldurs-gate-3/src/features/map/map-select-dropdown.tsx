import { Check, ChevronDown, MapPin, Search, type LucideIcon } from "lucide-react";
import { Fragment, useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import TruncatedText from "../../components/truncated-text";
import { useDismissable } from "../../hooks/use-dismissable";
import { cn } from "../../lib/cn";

export interface MapSelectOption {
  id: string;
  name: string;
  group?: string;
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
  placement?: "top" | "bottom";
  className?: string;
  triggerClassName?: string;
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
  placement = "bottom",
  className,
  triggerClassName,
}: MapSelectDropdownProps) => {
  const { i18n } = useTranslation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  const selectedId = value === undefined ? lastId : value;
  const current = options.find((option) => option.id === selectedId);
  const searchable = options.length >= SEARCH_THRESHOLD;
  const close = useCallback(() => {
    if (rootRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
    setOpen(false);
    setQuery("");
  }, []);
  const normalize = (text: string) => text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase(i18n.language);
  const normalizedQuery = normalize(query.trim());
  const filteredOptions = normalizedQuery
    ? options.filter(({ name, group }) => normalize(`${group ?? ""} ${name}`).includes(normalizedQuery))
    : options;

  useDismissable(open, rootRef, close);

  useEffect(() => {
    if (!open) return;
    if (searchable) searchRef.current?.focus();
    else (optionRefs.current.find((option) => option?.getAttribute("aria-selected") === "true")
      ?? optionRefs.current[0])?.focus();
  }, [open, searchable]);

  const selectOption = (id: string) => {
    setLastId(id);
    close();
    onSelect(id);
  };

  if (options.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery("");
        }
      }}
      onKeyDown={(event) => {
        const inSearch = event.target === searchRef.current;
        if (event.key === "Enter" && inSearch) {
          event.preventDefault();
          if (filteredOptions[0]) selectOption(filteredOptions[0].id);
          return;
        }
        const arrow = event.key === "ArrowDown" || event.key === "ArrowUp";
        const edge = !inSearch && (event.key === "Home" || event.key === "End");
        if (!arrow && !edge) return;
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        if (filteredOptions.length === 0) return;
        const currentIndex = optionRefs.current.indexOf(event.target as HTMLButtonElement);
        const lastIndex = filteredOptions.length - 1;
        const nextIndex = event.key === "Home" ? 0
          : event.key === "End" ? lastIndex
            : currentIndex < 0 ? (event.key === "ArrowUp" ? lastIndex : 0)
              : (currentIndex + (event.key === "ArrowUp" ? -1 : 1) + filteredOptions.length) % filteredOptions.length;
        optionRefs.current[nextIndex]?.focus();
        optionRefs.current[nextIndex]?.scrollIntoView({ block: "nearest" });
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) close();
          else setOpen(true);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface/80 px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none transition-colors hover:bg-surface-hover focus-visible:border-accent",
          triggerClassName,
        )}
      >
        <Icon size={13} className="shrink-0 text-zinc-400" aria-hidden="true" />
        <TruncatedText
          text={current?.name ?? placeholder}
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
          className={cn(
            "absolute inset-x-0 z-50 flex max-h-64 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-xl shadow-black/40 animate-fade-in",
            placement === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]",
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
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className="min-h-0 flex-1 overflow-y-auto px-1 py-1"
          >
            {filteredOptions.map((option, index) => {
              const selected = option.id === selectedId;
              const showGroup = option.group && option.group !== filteredOptions[index - 1]?.group;
              return (
                <Fragment key={option.id}>
                  {showGroup && (
                    <div
                      role="presentation"
                      className="px-2.5 pb-1 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-accent/75 first:pt-1"
                    >
                      {option.group}
                    </div>
                  )}
                  <button
                    ref={(element) => { optionRefs.current[index] = element; }}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={selected}
                    onClick={() => selectOption(option.id)}
                    className={cn(
                      "flex w-full cursor-pointer items-start gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[12px] leading-5 transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-accent",
                      selected ? "text-white" : "text-zinc-300",
                    )}
                  >
                    <span className="grid h-5 w-4 shrink-0 place-items-center">
                      {selected && <Check size={13} className="text-accent" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1 whitespace-normal break-words">{option.name}</span>
                  </button>
                </Fragment>
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
