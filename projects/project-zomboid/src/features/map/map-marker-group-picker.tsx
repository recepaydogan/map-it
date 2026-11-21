import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { MARKER_GROUPS } from "./marker-group-config";
import type { UserMarkerGroup } from "./types";

interface MapMarkerGroupPickerProps {
  group: UserMarkerGroup;
  onChange: (group: UserMarkerGroup) => void;
}

const MapMarkerGroupPicker = ({ group, onChange }: MapMarkerGroupPickerProps) => {
  const { t } = useTranslation();

  return (
    <div className="map-marker-group-picker">
      <p className="map-micro-label">{t("map.markerGroups.group")}</p>
      <div className="map-marker-group-options">
        {MARKER_GROUPS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn("map-marker-group-option", group === id && "map-marker-group-option-active")}
            aria-pressed={group === id}
          >
            <Icon size={13} aria-hidden="true" />
            <span>{t(`map.markerGroups.${id}`)}</span>
            {group === id && <Check size={11} className="ml-auto" aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  );
};

export default MapMarkerGroupPicker;
