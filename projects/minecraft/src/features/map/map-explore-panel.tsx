import MapCategoryFilter from "./map-category-filter";
import MapMarkerGroupFilter from "./map-marker-group-filter";
import MapPersonalMarkerFilter, { type PersonalMarkerLayer } from "./map-personal-marker-filter";
import type { UserMarkerGroup } from "./types";

interface MapExplorePanelProps {
  activeCategories: string[];
  categoryCounts: Record<string, number>;
  markerGroupCounts: Partial<Record<UserMarkerGroup, number>>;
  hiddenMarkerGroups: UserMarkerGroup[];
  personalMarkerCounts: Record<PersonalMarkerLayer, number>;
  hiddenPersonalMarkerLayers: PersonalMarkerLayer[];
  compact: boolean;
  onToggleCategory: (categoryId: string) => void;
  onSetCategories: (categoryIds: string[]) => void;
  onToggleMarkerGroup: (group: UserMarkerGroup) => void;
  onTogglePersonalMarkerLayer: (layer: PersonalMarkerLayer) => void;
}

/** The "Menu" panel: map layers, then the player's own saved/completed layers and marker groups. */
const MapExplorePanel = ({
  activeCategories,
  categoryCounts,
  markerGroupCounts,
  hiddenMarkerGroups,
  personalMarkerCounts,
  hiddenPersonalMarkerLayers,
  compact,
  onToggleCategory,
  onSetCategories,
  onToggleMarkerGroup,
  onTogglePersonalMarkerLayer,
}: MapExplorePanelProps) => (
  <div className="space-y-3">
    <section data-tour="filters">
      <MapCategoryFilter
        activeCategories={activeCategories}
        counts={categoryCounts}
        onToggle={onToggleCategory}
        onSetCategories={onSetCategories}
      />
      {!compact && (
        <MapPersonalMarkerFilter
          counts={personalMarkerCounts}
          hiddenLayers={hiddenPersonalMarkerLayers}
          onToggle={onTogglePersonalMarkerLayer}
        />
      )}
      {!compact && (
        <MapMarkerGroupFilter
          counts={markerGroupCounts}
          hiddenGroups={hiddenMarkerGroups}
          onToggle={onToggleMarkerGroup}
        />
      )}
    </section>
  </div>
);

export default MapExplorePanel;
