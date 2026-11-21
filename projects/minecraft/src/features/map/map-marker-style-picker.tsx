import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getUserMarkerAppearance, USER_MARKER_COLORS, USER_MARKER_ICONS } from "./map-config";
import MapPointIcon from "./map-point-icon";
import type { UserMarkerColor, UserMarkerIcon, UserMarkerStyleChange } from "./types";

interface MapMarkerStylePickerProps {
  color: UserMarkerColor;
  icon: UserMarkerIcon | null;
  onChange: (change: UserMarkerStyleChange) => void;
  showColors?: boolean;
  children?: ReactNode;
  extraIconsLabel?: string;
}

const MapMarkerStylePicker = ({ color, icon, onChange, showColors = true, children, extraIconsLabel }: MapMarkerStylePickerProps) => {
  const { t } = useTranslation();

  return (
    <section className="map-marker-style-picker">
      <p className="map-micro-label">{t("map.markerStyle.title")}</p>
      <div className="map-marker-style-icons" aria-label={t("map.markerStyle.iconLabel")}>
        {USER_MARKER_ICONS.map(({ id, labelKey, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange({ icon: id })}
            className={cn("map-marker-style-icon", icon === id && "map-marker-style-icon-active")}
            aria-label={t(labelKey)}
            title={t(labelKey)}
            aria-pressed={icon === id}
          >
            <span className={cn("map-marker map-marker-style-preview", getUserMarkerAppearance(color, id).markerClass)}>
              <MapPointIcon fallback={Icon} size={18} strokeWidth={2.4} />
            </span>
          </button>
        ))}
      </div>
      {showColors && <div className="map-marker-style-colors" aria-label={t("map.markerStyle.colorLabel")}>
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
      </div>}
      {children && <div className="map-marker-style-extra-icons">
        {extraIconsLabel && <p className="map-micro-label">{extraIconsLabel}</p>}
        <div className="map-marker-style-icons" aria-label={extraIconsLabel}>{children}</div>
      </div>}
    </section>
  );
};

export default MapMarkerStylePicker;
