import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { MAP_CATEGORIES, USER_MARKER_COLORS, USER_MARKER_ICONS } from "./map-config";
import MapPointIcon from "./map-point-icon";
import type { UserMarkerColor, UserMarkerIcon, UserMarkerStyleChange } from "./types";

interface MapMarkerStylePickerProps {
  color: UserMarkerColor;
  icon: UserMarkerIcon;
  imageCategory?: string;
  onChange: (change: UserMarkerStyleChange) => void;
}

const MapMarkerStylePicker = ({ color, icon, imageCategory, onChange }: MapMarkerStylePickerProps) => {
  const { t } = useTranslation();

  return (
    <section className="map-marker-style-picker">
      <p className="map-micro-label">{t("map.markerStyle.title")}</p>
      <div className="map-marker-style-icons" aria-label={t("map.markerStyle.iconLabel")}>
        {USER_MARKER_ICONS.map(({ id, labelKey, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange({ icon: id, imageCategory: undefined })}
            className={cn("map-marker-style-icon", !imageCategory && icon === id && "map-marker-style-icon-active")}
            aria-label={t(labelKey)}
            title={t(labelKey)}
            aria-pressed={!imageCategory && icon === id}
          >
            <Icon size={14} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" aria-label={t("map.custom.image")}>
        {MAP_CATEGORIES.filter((category) => category.nativeIconPath).map((category) => (
          <button key={category.id} type="button" onClick={() => onChange({ imageCategory: category.id })}
            className={cn("map-marker-style-icon", imageCategory === category.id && "map-marker-style-icon-active")}
            title={t(category.labelKey)} aria-label={t(category.labelKey)} aria-pressed={imageCategory === category.id}>
            <MapPointIcon fallback={category.icon} source={category.nativeIconPath} size={20} />
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
