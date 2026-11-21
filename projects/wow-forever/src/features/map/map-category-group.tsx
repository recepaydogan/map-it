import { Check, ChevronDown, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import MapCategoryToggle from "./map-category-toggle";
import MapFilterCount from "./map-filter-count";
import type { MapCategoryGroupConfig, MapFilterCategory } from "./map-config";

interface MapCategoryGroupProps {
  group: Pick<MapCategoryGroupConfig, "labelKey">;
  categories: MapFilterCategory[];
  countCategories: MapFilterCategory[];
  counts: Record<string, number>;
  foundCounts: Record<string, number>;
  trackFound?: boolean;
  activeCategories: string[];
  /** Expansion is owned by the filter list (sections can be expanded independently). */
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
  trackFound = true,
  activeCategories,
  open,
  onToggleOpen,
  onToggleCategory,
  onSetGroup,
  onShowOnly,
}: MapCategoryGroupProps) => {
  const { t } = useTranslation();
  const label = t(group.labelKey);
  const categoryIds = categories.flatMap(({ ids }) => ids);
  const activeInGroup = categoryIds.filter((id) => activeCategories.includes(id)).length;
  const allOn = activeInGroup === categoryIds.length && categoryIds.length > 0;
  const noneOn = activeInGroup === 0;
  const onlyGroupActive = allOn && activeCategories.length === categoryIds.length;
  const countIds = countCategories.flatMap(({ ids }) => ids);
  const total = countIds.reduce((sum, id) => sum + (counts[id] ?? 0), 0);
  const found = countIds.reduce((sum, id) => sum + (foundCounts[id] ?? 0), 0);

  return (
    <div className="map-filter-section">
      <div className="map-filter-section-header group/hdr flex items-center gap-1">
        {/* Tri-state group checkbox: toggles the whole group in one tap. */}
        <button
          type="button"
          onClick={() => onSetGroup(!allOn)}
          aria-label={t(allOn ? "map.filters.hideGroup" : "map.filters.showGroup", { group: label })}
          title={t(allOn ? "map.filters.hideGroup" : "map.filters.showGroup", { group: label })}
          className={cn(
            "grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors",
            allOn
              ? "border-accent bg-transparent text-accent"
              : noneOn
                ? "border-zinc-500 hover:border-zinc-400"
                : "border-accent/60 bg-transparent text-accent",
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
          <span className="map-filter-section-label min-w-0 flex-1 text-[12px] font-semibold text-zinc-100">{label}</span>
        </button>
        <button
          type="button"
          onClick={(event) => {
            onShowOnly(categoryIds);
            if (event.detail > 0) event.currentTarget.blur();
          }}
          aria-pressed={onlyGroupActive}
          title={t("map.filters.onlyLayer", { layer: label })}
          aria-label={t("map.filters.onlyLayer", { layer: label })}
          className={cn(
            "map-filter-group-only",
            onlyGroupActive && "is-active",
          )}
        >
          {t("map.filters.only")}
        </button>
        <MapFilterCount found={trackFound ? found : undefined} total={total} group />
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
                found={trackFound ? ids.reduce((sum, id) => sum + (foundCounts[id] ?? 0), 0) : undefined}
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
