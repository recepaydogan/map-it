import { useState } from "react";
import MapCategoryFilter from "./map-category-filter";
import MapMarkerGroupFilter from "./map-marker-group-filter";
import type { MapPointStatusFilter } from "./map-filter-quick-controls";
import type { PersonalMarkerLayer } from "./map-personal-marker-filter";
import type { UserMarkerGroup } from "./types";

interface MapExplorePanelProps {
  activeCategories: string[];
  categoryCounts: Record<string, number>;
  completedCategoryCounts: Record<string, number>;
  markerGroupCounts: Partial<Record<UserMarkerGroup, number>>;
  hiddenMarkerGroups: UserMarkerGroup[];
  personalMarkerCounts: Record<PersonalMarkerLayer, number>;
  hiddenPersonalMarkerLayers: PersonalMarkerLayer[];
  hiddenPointStatuses: MapPointStatusFilter[];
  compact: boolean;
  onToggleCategory: (categoryId: string) => void;
  onSetCategories: (categoryIds: string[]) => void;
  onToggleMarkerGroup: (group: UserMarkerGroup) => void;
  onTogglePersonalMarkerLayer: (layer: PersonalMarkerLayer) => void;
  onTogglePointStatus: (status: MapPointStatusFilter) => void;
}

/** The "Menu" panel: map categories and marker groups. */
const MapExplorePanel = ({
  activeCategories,
  categoryCounts,
  completedCategoryCounts,
  markerGroupCounts,
  hiddenMarkerGroups,
  hiddenPointStatuses,
  compact,
  onToggleCategory,
  onSetCategories,
  onToggleMarkerGroup,
  onTogglePointStatus,
}: MapExplorePanelProps) => {
  const [categoryQuery, setCategoryQuery] = useState("");
  const searchingCategories = categoryQuery.trim().length > 0;

  return (
    <div className="space-y-3">
      <section data-tour="filters">
        <MapCategoryFilter
          activeCategories={activeCategories}
          counts={categoryCounts}
          completedCounts={completedCategoryCounts}
          hiddenStatuses={hiddenPointStatuses}
          query={categoryQuery}
          onToggle={onToggleCategory}
          onSetCategories={onSetCategories}
          onToggleStatus={onTogglePointStatus}
          onQueryChange={setCategoryQuery}
        />
        {!compact && !searchingCategories && (
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
