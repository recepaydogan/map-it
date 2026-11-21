import { Check, ChevronDown, Search } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { MapSpawnData } from "./types";
import { useDismissable } from "./use-dismissable";

interface MapSpawnProfessionFilterProps {
  data: MapSpawnData;
  value: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (professionId: string | null) => void;
}

/**
 * Profession picker for the spawn-point layer. The list used to expand inline,
 * which pushed 25 professions into the world-layer panel and made the whole
 * panel scroll; it is now a floating popover with its own search box, so the
 * panel behind it never moves.
 */
const MapSpawnProfessionFilter = ({
  data,
  value,
  open,
  onOpenChange,
  onChange,
}: MapSpawnProfessionFilterProps) => {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const selected = data.professions.find(({ id }) => id === value);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useDismissable(open, rootRef, close);

  const toggle = () => {
    if (!open) setQuery("");
    onOpenChange(!open);
  };

  const term = query.trim().toLowerCase();
  const matches = term
    ? data.professions.filter(({ label }) => label.toLowerCase().includes(term))
    : data.professions;
  const showAllRow = !term || t("map.spawnPoints.allProfessions").toLowerCase().includes(term);

  const select = (professionId: string | null) => {
    onChange(professionId);
    onOpenChange(false);
  };

  return (
    <div ref={rootRef} className="relative mt-2.5 border-t border-border pt-2.5">
      <p className="px-0.5 pb-1.5 text-[12px] font-medium text-zinc-400">
        {t("map.spawnPoints.profession")}
      </p>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-2 text-left transition-colors",
          open ? "border-accent/60 bg-accent-soft" : "border-border bg-white/[0.03] hover:bg-surface-hover",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-100">
          {selected?.label ?? t("map.spawnPoints.allProfessions")}
        </span>
        <span className="shrink-0 text-[12px] tabular-nums text-zinc-400">
          {selected?.pointCount ?? data.totalPoints}
        </span>
        <ChevronDown
          size={14}
          className={cn("shrink-0 text-zinc-500 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          data-map-nested-popover
          className="absolute inset-x-0 top-[calc(100%+6px)] z-10 overflow-hidden rounded-[var(--radius-md)] border border-border bg-elevated shadow-2xl shadow-black/50 animate-fade-in"
        >
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <Search size={13} className="shrink-0 text-zinc-500" aria-hidden="true" />
            {/* The popover only mounts on an explicit click, so focus belongs
                in its search box. */}
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("map.spawnPoints.searchProfession")}
              aria-label={t("map.spawnPoints.searchProfession")}
              className="min-w-0 flex-1 bg-transparent text-[12px] text-zinc-100 outline-none placeholder:text-zinc-500"
            />
          </div>
          <div
            role="listbox"
            aria-label={t("map.spawnPoints.profession")}
            className="scroll-slim max-h-[13rem] overflow-y-auto p-1"
          >
            {showAllRow && (
              <button
                type="button"
                role="option"
                aria-selected={value === null}
                onClick={() => select(null)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-white/8",
                  value === null ? "bg-accent-soft" : "",
                )}
              >
                <span className="grid w-4 shrink-0 place-items-center">
                  {value === null && <Check size={13} className="text-accent" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-zinc-100">
                  {t("map.spawnPoints.allProfessions")}
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-zinc-400">{data.totalPoints}</span>
              </button>
            )}
            {matches.map((profession) => {
              const active = profession.id === value;
              return (
                <button
                  key={profession.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => select(profession.id)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-white/8",
                    active ? "bg-accent-soft" : "",
                  )}
                >
                  <span className="grid w-4 shrink-0 place-items-center">
                    {active && <Check size={13} className="text-accent" aria-hidden="true" />}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[12px]",
                      active ? "font-medium text-zinc-100" : "text-zinc-300",
                    )}
                  >
                    {profession.label}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-zinc-400">
                    {profession.pointCount}
                  </span>
                </button>
              );
            })}
            {!showAllRow && matches.length === 0 && (
              <p className="px-2 py-3 text-center text-[12px] text-zinc-500">
                {t("map.spawnPoints.noProfessionMatch")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MapSpawnProfessionFilter;
