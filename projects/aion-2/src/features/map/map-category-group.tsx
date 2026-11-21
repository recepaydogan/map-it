import { Check, ChevronDown, Minus, Search, X } from "lucide-react";
import { createElement, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import MapCategoryToggle from "./map-category-toggle";
import type { MapCategoryGroupConfig, MapFilterCategory } from "./map-config";

interface MapCategoryGroupProps {
  group: MapCategoryGroupConfig;
  categories: MapFilterCategory[];
  counts: Record<string, number>;
  foundCounts: Record<string, number>;
  activeCategories: string[];
  /** Expansion is owned by the filter list (accordion: at most one group open). */
  open: boolean;
  onToggleOpen: () => void;
  onToggleCategory: (categoryIds: string[]) => void;
  onSetGroup: (on: boolean) => void;
  onShowOnly: (categoryIds: string[]) => void;
}

/**
 * One collapsible layer group. The header carries a tri-state checkbox (toggles
 * the whole group) plus a live marker count, so the user can act on a group
 * without expanding it — and only opens the group they care about.
 */
const MapCategoryGroup = ({
  group,
  categories,
  counts,
  foundCounts,
  activeCategories,
  open,
  onToggleOpen,
  onToggleCategory,
  onSetGroup,
  onShowOnly,
}: MapCategoryGroupProps) => {
  const { t, i18n } = useTranslation();
  const [petQuery, setPetQuery] = useState("");
  const label = t(group.labelKey);
  const categoryIds = categories.flatMap(({ ids }) => ids);
  const activeInGroup = categoryIds.filter((id) => activeCategories.includes(id)).length;
  const allOn = activeInGroup === categoryIds.length && categoryIds.length > 0;
  const noneOn = activeInGroup === 0;
  const onlyGroupActive = allOn && activeCategories.length === categoryIds.length;
  const markerCount = categoryIds.reduce((total, id) => total + (counts[id] ?? 0), 0);
  const foundCount = categoryIds.reduce((total, id) => total + (foundCounts[id] ?? 0), 0);
  const supportsFound = categories.every(({ category }) => category.supportsFound !== false);
  const progressLabel = t(supportsFound ? "map.filters.foundCount" : "map.filters.locationCount",
    { count: markerCount, found: foundCount, total: markerCount });
  const normalizedPetQuery = petQuery.trim().toLocaleLowerCase(i18n.language);
  const visibleCategories = group.id === "pets" && normalizedPetQuery
    ? categories.filter(({ category, label: categoryLabel }) =>
      (categoryLabel ?? t(category.filterLabelKey ?? category.labelKey)).toLocaleLowerCase(i18n.language).includes(normalizedPetQuery))
    : categories;

  return (
    <div data-map-filter-group={group.id} className="border-b border-border/60 last:border-b-0">
      <div className="group/hdr flex items-center gap-1">
        {/* Tri-state group checkbox: toggles the whole group in one tap. */}
        <button
          type="button"
          onClick={() => onSetGroup(!allOn)}
          aria-label={t(allOn ? "map.filters.hideGroup" : "map.filters.showGroup", { group: label })}
          title={t(allOn ? "map.filters.hideGroup" : "map.filters.showGroup", { group: label })}
          className={cn(
            "grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors",
            allOn
              ? "border-accent bg-accent text-on-accent"
              : noneOn
                ? "border-zinc-500 hover:border-zinc-400"
                : "border-accent bg-accent/30 text-accent",
          )}
        >
          {allOn && <Check size={11} strokeWidth={3} aria-hidden="true" />}
          {!allOn && !noneOn && <Minus size={11} strokeWidth={3} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 text-left"
        >
          {createElement(group.icon, {
            size: 15,
            className: cn("shrink-0 transition-colors", noneOn ? "text-zinc-500" : "text-accent"),
            "aria-hidden": true,
          })}
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-100">{label}</span>
        </button>
        <button
          type="button"
          onClick={() => onShowOnly(categoryIds)}
          aria-pressed={onlyGroupActive}
          tabIndex={-1}
          title={t("map.filters.onlyLayer", { layer: label })}
          className={cn(
            "hidden cursor-pointer rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent hover:bg-accent-soft group-hover/hdr:block",
            onlyGroupActive && "bg-accent-soft",
          )}
        >
          {t("map.filters.only")}
        </button>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-label={`${label}: ${progressLabel}`}
          className="flex cursor-pointer items-center gap-1.5 py-2"
        >
          <span className="rounded-[var(--radius-full)] bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-300">
            {supportsFound ? `${foundCount.toLocaleString(i18n.language)} / ` : ""}{markerCount.toLocaleString(i18n.language)}
          </span>
          <ChevronDown
            size={15}
            className={cn("shrink-0 text-zinc-400 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-0.5 pb-2 pl-1">
          {group.id === "pets" && (
            <div className="map-filter-search mb-2 flex items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-1.5 transition-colors focus-within:border-accent">
              <Search size={14} className="shrink-0 text-zinc-400" aria-hidden="true" />
              <input
                type="text"
                value={petQuery}
                onChange={(event) => setPetQuery(event.target.value)}
                aria-label={t("map.filters.searchPets")}
                placeholder={t("map.filters.searchPets")}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-400"
              />
              {petQuery && <button
                type="button"
                onClick={() => setPetQuery("")}
                aria-label={t("map.filters.clearPetSearch")}
                className="grid h-4 w-4 cursor-pointer place-items-center rounded-[var(--radius-full)] text-zinc-400 hover:text-white"
              >
                <X size={13} aria-hidden="true" />
              </button>}
            </div>
          )}
          {visibleCategories.length === 0 && <p className="py-2 text-center text-xs text-zinc-400">{t("map.filters.noMatchingPets")}</p>}
          {visibleCategories.map(({ category, ids, label }) => {
            const selectedCount = ids.filter((id) => activeCategories.includes(id)).length;
            const active = selectedCount === ids.length;
            return <MapCategoryToggle
              key={category.id}
              category={category}
              label={label}
              active={active}
              partial={selectedCount > 0 && !active}
              onlyActive={active && activeCategories.length === ids.length}
              count={ids.reduce((total, id) => total + (counts[id] ?? 0), 0)}
              foundCount={ids.reduce((total, id) => total + (foundCounts[id] ?? 0), 0)}
              onToggle={() => onToggleCategory(ids)}
              onOnly={() => onShowOnly(ids)}
            />;
          })}
        </div>
      )}
    </div>
  );
};

export default MapCategoryGroup;
