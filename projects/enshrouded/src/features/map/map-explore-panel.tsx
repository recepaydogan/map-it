import MapCategoryFilter from "./map-category-filter";
import type { MapFilterFocusRequest } from "./map-config";
import type { UserMarkerGroup } from "./types";
import type { MapFaction } from "./map-faction-filter";

interface MapExplorePanelProps {
  filterFocusRequest?: MapFilterFocusRequest | null;
  activeCategories: string[];
  categoryCounts: Record<string, number>;
  foundCategoryCounts: Record<string, number>;
  markerGroupCounts: Partial<Record<UserMarkerGroup, number>>;
  foundMarkerGroupCounts: Partial<Record<UserMarkerGroup, number>>;
  hiddenMarkerGroups: UserMarkerGroup[];
  hiddenTrainerTypes: string[];
  hideCompleted: boolean;
  hideFavorites: boolean;
  onToggleHideCompleted: () => void;
  onToggleHideFavorites: () => void;
  onToggleCategory: (categoryId: string) => void;
  onSetCategories: (categoryIds: string[]) => void;
  onSetHiddenMarkerGroups: (groups: UserMarkerGroup[]) => void;
  onSetHiddenTrainerTypes: (types: string[]) => void;
  factions: readonly MapFaction[];
  onToggleFaction: (faction: MapFaction) => void;
}

/** The map layer filters shown in the sidebar. */
const MapExplorePanel = ({
  filterFocusRequest,
  activeCategories,
  categoryCounts,
  foundCategoryCounts,
  markerGroupCounts,
  foundMarkerGroupCounts,
  hiddenMarkerGroups,
  hiddenTrainerTypes,
  hideCompleted,
  hideFavorites,
  onToggleHideCompleted,
  onToggleHideFavorites,
  onToggleCategory,
  onSetCategories,
  onSetHiddenMarkerGroups,
  onSetHiddenTrainerTypes,
  factions,
  onToggleFaction,
}: MapExplorePanelProps) => (
  <div className="space-y-3">
    <section data-tour="filters">
      <MapCategoryFilter
        filterFocusRequest={filterFocusRequest}
        activeCategories={activeCategories}
        counts={categoryCounts}
        foundCounts={foundCategoryCounts}
        markerGroupCounts={markerGroupCounts}
        foundMarkerGroupCounts={foundMarkerGroupCounts}
        hiddenMarkerGroups={hiddenMarkerGroups}
        hiddenTrainerTypes={hiddenTrainerTypes}
        hideCompleted={hideCompleted}
        hideFavorites={hideFavorites}
        onToggleHideCompleted={onToggleHideCompleted}
        onToggleHideFavorites={onToggleHideFavorites}
        onToggle={onToggleCategory}
        onSetCategories={onSetCategories}
        onSetHiddenMarkerGroups={onSetHiddenMarkerGroups}
        onSetHiddenTrainerTypes={onSetHiddenTrainerTypes}
        factions={factions}
        onToggleFaction={onToggleFaction}
      />
    </section>
  </div>
);

export default MapExplorePanel;
