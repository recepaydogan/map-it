import MapCategoryFilter from "./map-category-filter";
import { PERSONAL_MARKERS_UI_ENABLED } from "./map-config";
import MapMarkerGroupFilter from "./map-marker-group-filter";
import type { UserMarkerGroup } from "./types";

interface MapExplorePanelProps {
  activeCategories: string[];
  categoryCounts: Record<string, number>;
  markerGroupCounts: Partial<Record<UserMarkerGroup, number>>;
  hiddenMarkerGroups: UserMarkerGroup[];
  hideLooted: boolean;
  hideFavorites: boolean;
  compact: boolean;
  onToggleCategory: (categoryId: string) => void;
  onSetCategories: (categoryIds: string[]) => void;
  onToggleMarkerGroup: (group: UserMarkerGroup) => void;
  onHideLootedChange: (hidden: boolean) => void;
  onHideFavoritesChange: (hidden: boolean) => void;
  usefulObjectsCoachmarkVisible?: boolean;
  onShowRecommendedUsefulObjects?: () => void;
  onDismissUsefulObjectsCoachmark?: () => void;
}

const MapExplorePanel = ({
  activeCategories,
  categoryCounts,
  markerGroupCounts,
  hiddenMarkerGroups,
  hideLooted,
  hideFavorites,
  compact,
  onToggleCategory,
  onSetCategories,
  onToggleMarkerGroup,
  onHideLootedChange,
  onHideFavoritesChange,
  usefulObjectsCoachmarkVisible = false,
  onShowRecommendedUsefulObjects,
  onDismissUsefulObjectsCoachmark,
}: MapExplorePanelProps) => {
  return (
    <div className="space-y-3">
      <section data-tour="filters">
        <MapCategoryFilter
          activeCategories={activeCategories}
          counts={categoryCounts}
          onToggle={onToggleCategory}
          onSetCategories={onSetCategories}
          hideLooted={hideLooted}
          hideFavorites={hideFavorites}
          onHideLootedChange={onHideLootedChange}
          onHideFavoritesChange={onHideFavoritesChange}
          usefulObjectsCoachmarkVisible={usefulObjectsCoachmarkVisible}
          onShowRecommendedUsefulObjects={onShowRecommendedUsefulObjects}
          onDismissUsefulObjectsCoachmark={onDismissUsefulObjectsCoachmark}
        />
        {!compact && PERSONAL_MARKERS_UI_ENABLED && (
          <MapMarkerGroupFilter
            counts={markerGroupCounts}
            hiddenGroups={hiddenMarkerGroups}
            onToggle={onToggleMarkerGroup}
          />
        )}
      </section>
    </div>
  );
};

export default MapExplorePanel;
