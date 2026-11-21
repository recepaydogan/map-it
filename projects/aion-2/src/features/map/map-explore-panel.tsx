import MapCategoryFilter from "./map-category-filter";
import type { MapCategoryGroupId } from "./map-config";
import type { MapPetSource } from "./map-pet-sources";

interface MapExplorePanelProps {
  activeCategories: string[];
  pets: MapPetSource[];
  requestedFilterGroup: { groupId: MapCategoryGroupId } | null;
  onFilterGroupOpened: (request: { groupId: MapCategoryGroupId }) => void;
  categoryCounts: Record<string, number>;
  foundCounts: Record<string, number>;
  hideCompleted: boolean;
  hideFavorites: boolean;
  onToggleHideCompleted: () => void;
  onToggleHideFavorites: () => void;
  onToggleCategory: (categoryId: string) => void;
  onSetCategories: (categoryIds: string[]) => void;
}

/** The map layer filters shown in the sidebar. */
const MapExplorePanel = ({
  activeCategories,
  pets,
  requestedFilterGroup,
  onFilterGroupOpened,
  categoryCounts,
  foundCounts,
  hideCompleted,
  hideFavorites,
  onToggleHideCompleted,
  onToggleHideFavorites,
  onToggleCategory,
  onSetCategories,
}: MapExplorePanelProps) => (
  <div className="space-y-3">
    <section data-tour="filters">
      <MapCategoryFilter
        activeCategories={activeCategories}
        pets={pets}
        requestedFilterGroup={requestedFilterGroup}
        onFilterGroupOpened={onFilterGroupOpened}
        counts={categoryCounts}
        foundCounts={foundCounts}
        hideCompleted={hideCompleted}
        hideFavorites={hideFavorites}
        onToggleHideCompleted={onToggleHideCompleted}
        onToggleHideFavorites={onToggleHideFavorites}
        onToggle={onToggleCategory}
        onSetCategories={onSetCategories}
      />
    </section>
  </div>
);

export default MapExplorePanel;
