import { Check, ChevronDown, Minus } from "lucide-react";
import { createElement } from "react";
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

  return <div className="border-b border-border/60 last:border-b-0">
    <div className="group/hdr flex items-center gap-1">
      <button type="button" onClick={() => onSetGroup(!allOn)}
        aria-label={t(allOn ? "map.filters.hideGroup" : "map.filters.showGroup", { group: label })}
        title={t(allOn ? "map.filters.hideGroup" : "map.filters.showGroup", { group: label })}
        className={cn("grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors",
          allOn ? "border-accent bg-accent text-on-accent"
            : noneOn ? "border-zinc-500 hover:border-zinc-400" : "border-accent bg-accent/30 text-accent")}
      >
        {allOn && <Check size={11} strokeWidth={3} aria-hidden="true" />}
        {!allOn && !noneOn && <Minus size={11} strokeWidth={3} aria-hidden="true" />}
      </button>
      <button type="button" onClick={onToggleOpen} aria-expanded={open}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 text-left">
        {createElement(group.icon, { size: 15,
          className: cn("shrink-0 transition-colors", noneOn ? "text-zinc-500" : "text-accent"),
          "aria-hidden": true })}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-100">{label}</span>
      </button>
      <MapFilterCount found={found} total={total} group />
      <button type="button" onClick={onToggleOpen} aria-expanded={open} aria-label={label}
        className="flex cursor-pointer items-center py-2">
        <ChevronDown size={15} className={cn("shrink-0 text-zinc-400 transition-transform", open && "rotate-180")}
          aria-hidden="true" />
      </button>
    </div>
    {open && <div className="flex flex-col gap-0.5 pb-2 pl-1">
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
