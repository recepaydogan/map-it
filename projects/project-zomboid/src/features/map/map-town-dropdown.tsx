import { Check, ChevronDown, MapPin, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import TruncatedText from "../../components/truncated-text";
import { cn } from "../../lib/cn";
import type { MapTown } from "./types";
import { useDismissable } from "./use-dismissable";

interface MapTownDropdownProps {
  towns: MapTown[];
  onSelect: (townId: string) => void;
  value?: string;
  placeholder?: string;
  ariaLabel?: string;
  placement?: "top" | "bottom";
  className?: string;
  triggerClassName?: string;
}

/**
 * Compact town jump control with a floating option list.
 */
const MapTownDropdown = ({
  towns,
  onSelect,
  value,
  placeholder,
  ariaLabel,
  placement = "bottom",
  className,
  triggerClassName,
}: MapTownDropdownProps) => {
  const { t, i18n } = useTranslation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [lastTownId, setLastTownId] = useState<string | null>(null);
  const selectedTownId = value === undefined ? lastTownId : value;
  const current = towns.find((town) => town.id === selectedTownId);
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);
  const normalize = (value: string) => value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase(i18n.language);
  const normalizedQuery = normalize(query.trim());
  const filteredTowns = normalizedQuery
    ? towns.filter(({ name }) => normalize(name).includes(normalizedQuery))
    : towns;

  useDismissable(open, rootRef, close);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  if (towns.length === 0) return null;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => {
          if (open) close();
          else setOpen(true);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface/80 px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none transition-colors hover:bg-surface-hover focus-visible:border-accent",
          triggerClassName,
        )}
      >
        <MapPin size={13} className="shrink-0 text-zinc-400" aria-hidden="true" />
        <TruncatedText
          text={current?.name ?? placeholder ?? t("map.towns.travel")}
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
          <label className="relative m-1.5 block shrink-0">
            <span className="sr-only">{t("map.towns.search")}</span>
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
              placeholder={t("map.towns.search")}
              className="h-8 w-full rounded-[var(--radius-sm)] border border-border bg-black/15 pl-8 pr-2.5 text-[11px] text-white outline-none placeholder:text-zinc-500 focus:border-accent/70"
            />
          </label>
          <div
            role="listbox"
            aria-label={ariaLabel ?? t("map.towns.label")}
            className="min-h-0 flex-1 overflow-y-auto px-1 pb-1"
          >
            {filteredTowns.map((town) => {
              const selected = town.id === selectedTownId;
              return (
                <button
                  key={town.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    setLastTownId(town.id);
                    close();
                    onSelect(town.id);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-surface-hover",
                    selected ? "text-white" : "text-zinc-300",
                  )}
                >
                  <span className="grid w-4 shrink-0 place-items-center">
                    {selected && <Check size={13} className="text-accent" aria-hidden="true" />}
                  </span>
                  <TruncatedText text={town.name} wrapperClassName="flex-1" />
                </button>
              );
            })}
            {filteredTowns.length === 0 && (
              <p className="px-2.5 py-5 text-center text-[11px] text-zinc-400">
                {t("map.towns.noSearchResults")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MapTownDropdown;
