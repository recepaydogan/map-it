import { Check, ChevronDown, Minus } from "lucide-react";
import { createElement, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import MapCategoryToggle from "./map-category-toggle";
import MapFilterCount from "./map-filter-count";
import type { MapCategoryGroupConfig, MapFilterCategory } from "./map-config";

interface MapCategoryGroupProps {
  group: MapCategoryGroupConfig;
  categories: MapFilterCategory[];
  countCategories: MapFilterCategory[];
  counts: Record<string, number>;
  foundCounts: Record<string, number>;
  activeCategories: string[];
  /** Expansion is owned by the filter list (accordion: at most one group open). */
  open: boolean;
  searching?: boolean;
  onToggleOpen: () => void;
  onToggleCategory: (categoryIds: string[]) => void;
  onSetGroup: (on: boolean) => void;
  onShowOnly: (categoryIds: string[]) => void;
}

/**
 * One collapsible layer group. The header carries a tri-state checkbox (toggles
 * the whole group), so the user can act on a group
 * without expanding it — and only opens the group they care about.
 */
const MapCategoryGroup = ({
  group,
  categories,
  countCategories,
  counts,
  foundCounts,
  activeCategories,
  open,
  searching = false,
  onToggleOpen,
  onToggleCategory,
  onSetGroup,
  onShowOnly,
}: MapCategoryGroupProps) => {
  const { t } = useTranslation();
  const [openSubgroups, setOpenSubgroups] = useState<string[]>([]);
  const label = t(group.labelKey);
  const categoryIds = categories.flatMap(({ ids }) => ids);
  const activeInGroup = categoryIds.filter((id) => activeCategories.includes(id)).length;
  const allOn = activeInGroup === categoryIds.length && categoryIds.length > 0;
  const noneOn = activeInGroup === 0;
  const onlyGroupActive = allOn && activeCategories.length === categoryIds.length;
  const countIds = countCategories.flatMap(({ ids }) => ids);
  const total = countIds.reduce((sum, id) => sum + (counts[id] ?? 0), 0);
  const found = countIds.reduce((sum, id) => sum + (foundCounts[id] ?? 0), 0);
  const categoryRow = ({ category, ids }: MapFilterCategory) => {
    const selectedCount = ids.filter((id) => activeCategories.includes(id)).length;
    const active = selectedCount === ids.length;
    return <div key={category.id} data-map-filter-category={category.id}>
      <MapCategoryToggle
        category={category}
        active={active}
        partial={selectedCount > 0 && !active}
        onlyActive={active && activeCategories.length === ids.length}
        count={ids.reduce((sum, id) => sum + (counts[id] ?? 0), 0)}
        found={ids.reduce((sum, id) => sum + (foundCounts[id] ?? 0), 0)}
        onToggle={() => onToggleCategory(ids)}
        onOnly={() => onShowOnly(ids)}
      />
    </div>;
  };
  const seenSubgroups = new Set<string>();

  return (
    <div className="border-b border-border/60 last:border-b-0">
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
        <MapFilterCount found={found} total={total} group />
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-label={label}
          className="flex cursor-pointer items-center py-2"
        >
          <ChevronDown
            size={15}
            className={cn("shrink-0 text-zinc-400 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-0.5 pb-2 pl-1">
          {categories.map(({ category, ids }) => {
            const subgroup = category.subgroupLabelKey;
            if (!subgroup) return categoryRow({ category, ids });
            if (seenSubgroups.has(subgroup)) return null;
            seenSubgroups.add(subgroup);
            const rows = categories.filter((row) => row.category.subgroupLabelKey === subgroup);
            const allRows = countCategories.filter((row) => row.category.subgroupLabelKey === subgroup);
            const subgroupIds = rows.flatMap((row) => row.ids);
            const selected = subgroupIds.filter((id) => activeCategories.includes(id)).length;
            const allSelected = selected === subgroupIds.length;
            const expanded = searching || openSubgroups.includes(subgroup);
            const subgroupLabel = t(subgroup);
            return <div key={subgroup} className="ml-1 border-l border-border/70 pl-2">
              <div className="flex items-center gap-2 rounded-[var(--radius-sm)] hover:bg-white/5">
                <button type="button" onClick={() => onToggleCategory(subgroupIds)}
                  aria-label={t(allSelected ? "map.filters.hideGroup" : "map.filters.showGroup", { group: subgroupLabel })}
                  aria-pressed={selected > 0 && !allSelected ? "mixed" : allSelected}
                  className={cn("grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors",
                    allSelected ? "border-accent bg-accent text-on-accent" : selected ? "border-accent bg-accent/30 text-accent" : "border-zinc-500 hover:border-zinc-400")}>
                  {allSelected && <Check size={11} strokeWidth={3} aria-hidden="true" />}
                  {selected > 0 && !allSelected && <Minus size={11} strokeWidth={3} aria-hidden="true" />}
                </button>
                <button type="button" onClick={() => setOpenSubgroups((current) => current.includes(subgroup)
                  ? current.filter((item) => item !== subgroup) : [...current, subgroup])}
                  aria-expanded={expanded}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-2 text-left text-[12px] font-medium text-zinc-200">
                  <span className="min-w-0 flex-1 truncate">{subgroupLabel}</span>
                  <MapFilterCount
                    found={allRows.flatMap((row) => row.ids).reduce((sum, id) => sum + (foundCounts[id] ?? 0), 0)}
                    total={allRows.flatMap((row) => row.ids).reduce((sum, id) => sum + (counts[id] ?? 0), 0)} />
                  <ChevronDown size={14} className={cn("shrink-0 text-zinc-400 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
                </button>
              </div>
              {expanded && <div className="pl-2">{rows.map(categoryRow)}</div>}
            </div>;
          })}
        </div>
      )}
    </div>
  );
};

export default MapCategoryGroup;
