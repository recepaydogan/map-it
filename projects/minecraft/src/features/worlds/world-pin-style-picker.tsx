import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import MapMarkerStylePicker from "../map/map-marker-style-picker";
import MapPointIcon from "../map/map-point-icon";
import type { UserMarkerColor } from "../map/types";
import { genericWorldPinIcon, isStructureWorldPinIcon, WORLD_PIN_STRUCTURE_ICONS } from "./world-pin-style";

const WorldPinStylePicker = ({ icon, color, onChange }: {
  icon: string;
  color: UserMarkerColor;
  onChange: (change: { icon?: string; color?: UserMarkerColor }) => void;
}) => {
  const { t } = useTranslation();
  return <MapMarkerStylePicker icon={genericWorldPinIcon(icon)} color={color}
    showColors={!isStructureWorldPinIcon(icon)} onChange={onChange}
    extraIconsLabel={t("structureMap.markers")}>
    {WORLD_PIN_STRUCTURE_ICONS.map(option => <button key={option.id} type="button"
      onClick={() => onChange({ icon: option.id })}
      className={cn("map-marker-style-icon", icon === option.id && "map-marker-style-icon-active")}
      aria-label={t(option.labelKey)} title={t(option.labelKey)} aria-pressed={icon === option.id}>
      <span className={cn("map-marker map-marker-style-preview map-marker-structure",
        option.darkArtwork && "map-marker-dark-artwork")}
        style={option.accentColor ? { borderColor: option.accentColor, color: option.accentColor } : undefined}>
        <MapPointIcon fallback={option.icon} source={option.artwork} size={18} />
      </span>
    </button>)}
  </MapMarkerStylePicker>;
};

export default WorldPinStylePicker;
