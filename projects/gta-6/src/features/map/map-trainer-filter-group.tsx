import { Check, ChevronDown, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { contentUrl } from "../../lib/content-url";
import { getCategoryConfig, type MapCategoryGroupConfig } from "./map-config";
import MapCategoryToggle from "./map-category-toggle";
import MapFilterCount from "./map-filter-count";
import { TRAINER_FILTER_IDS, trainerFilterKey, type TrainerCategory } from "./map-trainer-filters";

interface MapTrainerFilterGroupProps {
  group: MapCategoryGroupConfig;
  category: TrainerCategory;
  counts: Record<string, number>;
  foundCounts: Record<string, number>;
  active: boolean;
  onlyCategoryActive: boolean;
  hiddenTypes: string[];
  open: boolean;
  query: string;
  onToggleOpen: () => void;
  onSetGroup: (show: boolean) => void;
  onToggleType: (key: string) => void;
  onShowOnlyType: (key: string) => void;
}

const MapTrainerFilterGroup = ({
  group, category, counts, foundCounts, active, onlyCategoryActive, hiddenTypes, open, query,
  onToggleOpen, onSetGroup, onToggleType, onShowOnlyType,
}: MapTrainerFilterGroupProps) => {
  const { t } = useTranslation();
  const label = t(group.labelKey);
  const ids = TRAINER_FILTER_IDS[category].filter((id) => (counts[trainerFilterKey(category, id)] ?? 0) > 0);
  const groupMatches = query && label.toLocaleLowerCase().includes(query);
  const visibleIds = query && !groupMatches
    ? ids.filter((id) => t(`map.trainerFilters.${category}.${id}`).toLocaleLowerCase().includes(query))
    : ids;
  if (!visibleIds.length) return null;

  const activeCount = active ? ids.filter((id) => !hiddenTypes.includes(trainerFilterKey(category, id))).length : 0;
  const allOn = activeCount === ids.length;
  const noneOn = activeCount === 0;
  const total = ids.reduce((sum, id) => sum + (counts[trainerFilterKey(category, id)] ?? 0), 0);
  const found = ids.reduce((sum, id) => sum + (foundCounts[trainerFilterKey(category, id)] ?? 0), 0);
  const baseCategory = getCategoryConfig(category);

  return <div className="map-filter-section">
    <div className="map-filter-section-header">
      <button type="button" onClick={() => onSetGroup(!allOn)}
        aria-label={t(allOn ? "map.filters.hideGroup" : "map.filters.showGroup", { group: label })}
        title={t(allOn ? "map.filters.hideGroup" : "map.filters.showGroup", { group: label })}
        className={cn("grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors",
          allOn ? "border-accent text-accent"
            : noneOn ? "border-zinc-500 hover:border-zinc-400" : "border-accent/60 text-accent")}
      >
        {allOn && <Check size={11} strokeWidth={3} aria-hidden="true" />}
        {!allOn && !noneOn && <Minus size={11} strokeWidth={3} aria-hidden="true" />}
      </button>
      <button type="button" onClick={onToggleOpen} aria-expanded={open}
        className="map-filter-section-button">
        <span className="map-filter-section-label">{label}</span>
        <MapFilterCount found={found} total={total} group />
        <ChevronDown size={15} className={cn("shrink-0 text-zinc-400 transition-transform", open && "rotate-180")}
          aria-hidden="true" />
      </button>
    </div>
    {open && <div className="map-filter-category-grid">
      {visibleIds.map((id) => {
        const key = trainerFilterKey(category, id);
        const enabled = active && !hiddenTypes.includes(key);
        const rowCategory = {
          ...baseCategory,
          id: key,
          labelKey: `map.trainerFilters.${category}.${id}`,
          filterLabelKey: undefined,
          nativeIconPath: (category === "class-trainer" && id !== "other") || id === "weapon-master"
            ? contentUrl(`maps/client-icons/class-trainers/${id}.svg`) : baseCategory.nativeIconPath,
        };
        return <div key={key} data-map-filter-category={category}>
          <MapCategoryToggle category={rowCategory} active={enabled} partial={false}
            onlyActive={enabled && activeCount === 1 && onlyCategoryActive}
            count={counts[key] ?? 0} found={foundCounts[key] ?? 0}
            onToggle={() => onToggleType(key)} onOnly={() => onShowOnlyType(key)} />
        </div>;
      })}
    </div>}
  </div>;
};

export default MapTrainerFilterGroup;
