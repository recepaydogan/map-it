import { Check, ChevronDown, Minus } from "lucide-react";
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
  /** Expansion is managed by the filter list. */
  open: boolean;
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
  onToggleOpen,
  onToggleCategory,
  onSetGroup,
  onShowOnly,
}: MapCategoryGroupProps) => {
  const { t } = useTranslation();
  const label = t(group.labelKey);
  const categoryIds = countCategories.flatMap(({ ids }) => ids);
  const activeInGroup = categoryIds.filter((id) => activeCategories.includes(id)).length;
  const allOn = activeInGroup === categoryIds.length && categoryIds.length > 0;
  const noneOn = activeInGroup === 0;
  const onlyGroupActive = allOn && activeCategories.length === categoryIds.length;
  const total = categoryIds.reduce((sum, id) => sum + (counts[id] ?? 0), 0);
  const found = categoryIds.reduce((sum, id) => sum + (foundCounts[id] ?? 0), 0);

  return (
    <div className="map-filter-section">
      <div className="map-filter-section-header">
        {/* Tri-state group checkbox: toggles the whole group in one tap. */}
        <button
          type="button"
          onClick={() => onSetGroup(!allOn)}
          aria-label={t(allOn ? "map.filters.hideGroup" : "map.filters.showGroup", { group: label })}
          title={t(allOn ? "map.filters.hideGroup" : "map.filters.showGroup", { group: label })}
          className={cn(
            "grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors",
            allOn
              ? "border-accent text-accent"
              : noneOn
                ? "border-zinc-500 hover:border-zinc-400"
                : "border-accent/60 text-accent",
          )}
        >
          {allOn && <Check size={11} strokeWidth={3} aria-hidden="true" />}
          {!allOn && !noneOn && <Minus size={11} strokeWidth={3} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className="map-filter-section-button"
        >
          <span className="map-filter-section-label">{label}</span>
          <MapFilterCount found={found} total={total} group />
          <ChevronDown size={15} className={cn("shrink-0 text-zinc-400 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            onShowOnly(categoryIds);
            if (event.detail > 0) event.currentTarget.blur();
          }}
          aria-pressed={onlyGroupActive}
          aria-label={t("map.filters.onlyLayer", { layer: label })}
          title={t("map.filters.onlyLayer", { layer: label })}
          className={cn("map-filter-only map-filter-group-only", onlyGroupActive && "is-active")}
        >
          {t("map.filters.only")}
        </button>
      </div>

      {open && (
        <div className="map-filter-category-grid">
          {categories.map(({ category, ids }) => {
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
          })}
        </div>
      )}
    </div>
  );
};

export default MapCategoryGroup;
