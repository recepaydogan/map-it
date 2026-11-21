import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { resolveUserMarkerIcon, USER_MARKER_ICONS } from "./map-config";
import MapPointIcon from "./map-point-icon";
import type { UserMarkerIcon, UserMarkerStyleChange } from "./types";

interface MapMarkerStylePickerProps {
  icon: UserMarkerIcon;
  onChange: (change: UserMarkerStyleChange) => void;
}

const MapMarkerStylePicker = ({ icon, onChange }: MapMarkerStylePickerProps) => {
  const { t } = useTranslation();
  const selectedIcon = resolveUserMarkerIcon(icon);

  return (
    <section className="map-marker-style-picker">
      <p className="map-micro-label">{t("map.markerStyle.title")}</p>
      <div className="map-marker-style-icons" aria-label={t("map.markerStyle.iconLabel")}>
        {USER_MARKER_ICONS.map(({ id, labelKey, icon: Icon, nativeIconPath }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange({ icon: id })}
            className={cn("map-marker-style-icon", selectedIcon === id && "map-marker-style-icon-active")}
            aria-label={t(labelKey)}
            title={t(labelKey)}
            aria-pressed={selectedIcon === id}
          >
            <span className="map-marker map-marker-style-preview map-marker-custom">
              <MapPointIcon fallback={Icon} source={nativeIconPath} size={18} strokeWidth={2.4} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default MapMarkerStylePicker;
