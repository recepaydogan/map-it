import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { cn } from "../../lib/cn";
import { FILTER_CATEGORY_ROWS, MAP_CATEGORIES, MAP_CATEGORY_GROUPS, type MapCategoryGroupId } from "./map-config";
import MapSidebarToolPanel from "./map-sidebar-tool-panel";
import {
  MARKER_SIZE_MAX_PERCENT,
  MARKER_SIZE_MIN_PERCENT,
  MARKER_SIZE_STEP_PERCENT,
  clearMarkerCategorySizes,
  getMarkerCategorySizePercent,
  resetMarkerSizes,
  setMarkerCategorySizePercent,
  setMarkerGroupSizePercent,
  useMarkerSizes,
} from "./marker-size-settings";

const MapMarkerSizePanel = ({ categoryCounts, onClose }: { categoryCounts: Record<string, number>; onClose: () => void }) => {
  const { t } = useTranslation();
  const sizes = useMarkerSizes();
  const [selectedGroup, setSelectedGroup] = useState<MapCategoryGroupId | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const selected = MAP_CATEGORY_GROUPS.find(({ id }) => id === selectedGroup) ?? MAP_CATEGORY_GROUPS[0];
  if (!selected) return null;
  const activeGroup = selected.id;
  const categoryRows = activeGroup === "personal"
    ? MAP_CATEGORIES.filter(({ groupId }) => groupId === activeGroup).map((category) => ({ category, ids: [category.id] }))
    : FILTER_CATEGORY_ROWS.filter(({ category, ids }) => category.groupId === activeGroup
      && ids.some((id) => (categoryCounts[id] ?? 0) > 0));
  const selectedRow = categoryRows.find(({ category }) => category.id === selectedCategory);
  const currentSize = selectedRow
    ? getMarkerCategorySizePercent(selectedRow.ids[0]!, sizes) : sizes.groups[activeGroup];
  const hasOverride = selectedRow?.ids.some((id) => sizes.categories[id] !== undefined) ?? false;

  return <MapSidebarToolPanel
    title={t("map.filters.markerSizes")}
    description={t("map.filters.markerSizesDescription")}
    onClose={onClose}
  >
    <div>
      <div role="group" className="grid grid-cols-2 gap-2" aria-label={t("map.filters.markerSizes")}>
        {MAP_CATEGORY_GROUPS.map((group) => {
          const Icon = group.icon;
          const active = activeGroup === group.id;
          const customized = MAP_CATEGORIES.some(({ id, groupId }) => groupId === group.id && sizes.categories[id] !== undefined);
          return <button key={group.id} type="button" onClick={() => {
            setSelectedGroup(group.id);
            setSelectedCategory(null);
          }}
            aria-pressed={active}
            title={customized ? t("map.filters.customMarkerSizes") : undefined}
            className={cn("relative flex min-h-14 min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent",
              active ? "border-accent/70 bg-transparent" : "border-border/70 bg-background/40 hover:border-zinc-500 hover:bg-white/5")}
          >
            <Icon size={16} className={cn("shrink-0", active ? "text-accent" : "text-zinc-400")} aria-hidden="true" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[12px] font-medium leading-4 text-zinc-100">{t(group.labelKey)}</span>
              <span className={cn("text-[11px] font-semibold tabular-nums", active ? "text-accent" : "text-zinc-400")}>{sizes.groups[group.id]}%</span>
            </span>
            {customized && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
          </button>;
        })}
      </div>

      <div className="mt-4">
        <span className="mb-1.5 block text-[11px] font-medium text-zinc-400">{t("map.filters.markerType")}</span>
        <CategoryDropdown value={selectedRow?.category.id ?? ""}
          onChange={(value) => setSelectedCategory(value || null)}
          ariaLabel={t("map.filters.markerType")}
          options={[{ key: "", label: t("map.filters.groupDefaultSize") },
            ...categoryRows.map(({ category }) => ({ key: category.id,
              label: t(category.filterLabelKey ?? category.labelKey) }))]}
        />
      </div>

      <div className="mt-3 rounded-[var(--radius-md)] border border-border/70 bg-background/45 px-3 py-3">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-medium text-zinc-100">
            {selectedRow ? t(selectedRow.category.filterLabelKey ?? selectedRow.category.labelKey) : t(selected.labelKey)}
          </span>
          <output className="text-lg font-semibold tabular-nums text-accent">{currentSize}%</output>
        </div>
        <input type="range" min={MARKER_SIZE_MIN_PERCENT} max={MARKER_SIZE_MAX_PERCENT}
          step={MARKER_SIZE_STEP_PERCENT} value={currentSize}
          onChange={(event) => {
            const value = Number(event.currentTarget.value);
            if (selectedRow) setMarkerCategorySizePercent(selectedRow.ids, value);
            else setMarkerGroupSizePercent(activeGroup, value);
          }}
          aria-label={t("map.filters.markerSizeForGroup", { group: selectedRow
            ? t(selectedRow.category.filterLabelKey ?? selectedRow.category.labelKey) : t(selected.labelKey) })}
          className="w-full cursor-pointer accent-accent" />
        <div className="mt-1 flex justify-between text-[10px] tabular-nums text-zinc-400">
          <span>{MARKER_SIZE_MIN_PERCENT}%</span><span>{MARKER_SIZE_MAX_PERCENT}%</span>
        </div>
        {selectedRow && hasOverride && <button type="button" onClick={() => clearMarkerCategorySizes(selectedRow.ids)}
          className="mt-2 cursor-pointer text-[11px] font-medium text-accent hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
          {t("map.filters.useGroupDefaultSize")}
        </button>}
      </div>

      <button type="button" onClick={resetMarkerSizes}
        className="mt-3 flex cursor-pointer items-center gap-1.5 text-[12px] font-medium text-zinc-400 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
        <RotateCcw size={13} aria-hidden="true" />{t("map.filters.resetMarkerSizes")}
      </button>
    </div>
  </MapSidebarToolPanel>;
};

export default MapMarkerSizePanel;
