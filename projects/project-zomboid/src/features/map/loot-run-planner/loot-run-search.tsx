import { Check, PackageSearch, Search, X } from "lucide-react";
import { cn } from "../../../lib/cn";
import { useTranslation } from "react-i18next";
import type { LootRunItemOption } from "./loot-run-types";

interface LootRunSearchProps {
  query: string;
  items: LootRunItemOption[];
  totalItems: number;
  selectedItemIds: string[];
  onQueryChange: (query: string) => void;
  onToggle: (item: LootRunItemOption) => void;
}

const LootRunSearch = ({
  query,
  items,
  totalItems,
  selectedItemIds,
  onQueryChange,
  onToggle,
}: LootRunSearchProps) => {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <label className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-black/30 px-2.5 py-2 transition-colors focus-within:border-accent">
        <Search size={14} className="shrink-0 text-zinc-300" aria-hidden="true" />
        <input
          id="loot-run-search-input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("map.lootRun.searchPlaceholder")}
          aria-label={t("map.lootRun.searchLabel")}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-zinc-400"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label={t("map.lootRun.clearSearch")}
            className="grid h-5 w-5 cursor-pointer place-items-center rounded-[var(--radius-full)] text-zinc-300 hover:bg-white/10 hover:text-white"
          >
            <X size={12} aria-hidden="true" />
          </button>
        )}
      </label>

      <div className="flex items-center justify-between px-1 text-[10px] text-white/75">
        <span>{query ? t("map.lootRun.searchResults") : t("map.lootRun.popularItems")}</span>
        <span className="tabular-nums">
          {t("map.lootRun.itemCount", { count: totalItems.toLocaleString(i18n.language) })}
        </span>
      </div>

      {items.length > 0 ? (
        <ul
          className="scroll-slim min-h-0 flex-1 space-y-1 overflow-y-auto pr-1"
          aria-label={t("map.lootRun.searchResults")}
        >
          {items.map((item) => {
            const selected = selectedItemIds.includes(item.id);
            return <li key={item.id}>
              <button
                type="button"
                onClick={() => onToggle(item)}
                aria-pressed={selected}
                className={cn(
                  "group flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border px-2.5 py-2 text-left transition-colors",
                  selected
                    ? "border-border bg-white/5"
                    : "border-transparent hover:border-border hover:bg-white/5",
                )}
              >
                <span className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)]",
                  selected ? "bg-accent text-on-accent" : "bg-accent-soft text-accent",
                )}>
                  {selected
                    ? <Check size={14} strokeWidth={2.6} aria-hidden="true" />
                    : <PackageSearch size={14} aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-[12px] font-semibold text-white">
                    {item.name}
                  </strong>
                  <small className="block truncate text-[10px] text-white/70">
                    {item.lootable
                      ? t("map.lootRun.locationCount", { count: item.locationCount })
                      : t("map.lootRun.notContainerLoot")}
                  </small>
                </span>
                <span
                  className="shrink-0 text-right"
                  aria-label={item.lootable
                    ? t("map.lootRun.relativeChance", { score: Math.round(item.bestWeight) })
                    : undefined}
                >
                  <span className="block text-[10px] font-semibold tabular-nums text-white">
                    {item.lootable
                      ? t("map.lootRun.chanceScore", { score: Math.round(item.bestWeight) })
                      : t("map.lootRun.catalogOnly")}
                  </span>
                  {item.lootable && (
                    <span className="mt-0.5 block text-[8px] font-medium text-white/70">
                      {t("map.lootRun.chance")}
                    </span>
                  )}
                </span>
              </button>
            </li>;
          })}
        </ul>
      ) : (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-white/3 px-3 py-5 text-center">
          <PackageSearch size={18} className="mx-auto text-zinc-400" aria-hidden="true" />
          <p className="mt-2 text-[11px] text-white/75">{t("map.lootRun.noItems")}</p>
        </div>
      )}
    </div>
  );
};

export default LootRunSearch;
