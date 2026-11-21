import { Layers3 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import MapFilterOptionRow from "./map-filter-option-row";
import MapFilterSection from "./map-filter-section";
import { MARKER_GROUPS } from "./marker-group-config";
import type { UserMarkerGroup } from "./types";

interface MapMarkerGroupFilterProps {
  counts: Partial<Record<UserMarkerGroup, number>>;
  hiddenGroups: UserMarkerGroup[];
  onToggle: (group: UserMarkerGroup) => void;
}

/**
 * Visibility switches for the player's own marker groups. Rendered as the
 * closing block of the map-layers section, so it shares that section's row
 * language instead of announcing itself as a separate panel.
 */
const MapMarkerGroupFilter = ({ counts, hiddenGroups, onToggle }: MapMarkerGroupFilterProps) => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const populatedGroups = MARKER_GROUPS.filter(({ id }) => (counts[id] ?? 0) > 0);
  if (populatedGroups.length === 0) return null;
  const totalCount = populatedGroups.reduce((total, { id }) => total + (counts[id] ?? 0), 0);

  return (
    <MapFilterSection
      id="map-marker-groups"
      title={t("map.markerGroups.title")}
      summary={totalCount.toLocaleString(i18n.language)}
      icon={Layers3}
      open={open}
      onToggle={() => setOpen((current) => !current)}
    >
      <div className="flex flex-col gap-0.5">
        {populatedGroups.map(({ id, icon: Icon }) => {
          const visible = !hiddenGroups.includes(id);
          return (
            <MapFilterOptionRow
              key={id}
              label={t(`map.markerGroups.${id}`)}
              count={counts[id] ?? 0}
              active={visible}
              icon={Icon}
              onToggle={() => onToggle(id)}
            />
          );
        })}
      </div>
    </MapFilterSection>
  );
};

export default MapMarkerGroupFilter;
