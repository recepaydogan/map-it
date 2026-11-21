import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { USER_MARKER_COLORS, USER_MARKER_ICONS } from "./map-config";
import MapPointIcon from "./map-point-icon";
import type { UserMarkerColor, UserMarkerIcon, UserMarkerStyleChange } from "./types";

interface MapMarkerStylePickerProps {
  color: UserMarkerColor;
  icon: UserMarkerIcon;
  onChange: (change: UserMarkerStyleChange) => void;
}

const MapMarkerStylePicker = ({ color, icon, onChange }: MapMarkerStylePickerProps) => {
  const { t } = useTranslation();

  return (
    <section className="map-marker-style-picker">
      <p className="map-micro-label">{t("map.markerStyle.title")}</p>
      <div className="map-marker-style-icons scroll-slim" role="group" aria-label={t("map.markerStyle.iconLabel")}>
        {USER_MARKER_ICONS.map(({ id, labelKey, icon: Icon, nativeIconPath, serviceArt }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange({ icon: id })}
            className={cn("map-marker-style-icon", serviceArt && "map-service-art", icon === id && "map-marker-style-icon-active")}
            aria-label={t(labelKey)}
            title={t(labelKey)}
            aria-pressed={icon === id}
          >
            <MapPointIcon fallback={Icon} source={nativeIconPath} size={18} />
          </button>
        ))}
      </div>
      <div className="map-marker-style-colors" aria-label={t("map.markerStyle.colorLabel")}>
        {USER_MARKER_COLORS.map(({ id, labelKey, markerClass }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange({ color: id })}
            className={cn("map-marker-style-color", markerClass)}
            aria-label={t(labelKey)}
            title={t(labelKey)}
            aria-pressed={color === id}
          >
            {color === id && <Check size={11} strokeWidth={3} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </section>
  );
};

export default MapMarkerStylePicker;
