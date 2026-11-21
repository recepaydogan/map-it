import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import MapPointIcon from "../map/map-point-icon";
import type { UserMarkerColor } from "../map/types";
import type { BiomeCanvasState } from "../generation/biome-canvas";
import type { WorldPin } from "./world-types";
import { getWorldPinAppearance } from "./world-pin-style";
import { useWorldMapFrameView } from "./world-map-frame-context";

const WorldPinLayer = ({ pins, view: settledView, selectedId, interactive = true, onSelect }: {
  pins: readonly WorldPin[];
  view: BiomeCanvasState | null;
  selectedId: string | null;
  interactive?: boolean;
  onSelect: (pin: WorldPin) => void;
}) => {
  const { t } = useTranslation();
  const view = useWorldMapFrameView(settledView);
  if (!view) return null;
  return <div className="pointer-events-none absolute inset-0 z-[9] overflow-hidden" aria-label={t("map.categories.custom")}>
    {pins.map(pin => {
      const left = view.width / 2 + (pin.x - view.x) * view.zoom;
      const top = view.height / 2 + (pin.z - view.z) * view.zoom;
      if (left < 18 || top < 18 || left > view.width - 18 || top > view.height - 18) return null;
      const appearance = getWorldPinAppearance(pin.icon, pin.color as UserMarkerColor);
      return <button key={pin.id} type="button" data-world-map-pan-target data-world-pin={pin.id} data-name={pin.name || t("map.custom.personal")} aria-label={`${pin.name || t("map.custom.personal")} · X ${pin.x}, Z ${pin.z}`}
        className={cn("map-marker absolute -translate-x-1/2 -translate-y-1/2", interactive ? "pointer-events-auto cursor-pointer" : "pointer-events-none",
          appearance.markerClass,
          appearance.darkArtwork && "map-marker-dark-artwork",
          selectedId === pin.id && "map-marker-selected")}
        style={{ left, top, ...(appearance.accentColor ? { borderColor: appearance.accentColor, color: appearance.accentColor } : {}) }}
        onClick={() => onSelect(pin)}>
        <MapPointIcon fallback={appearance.icon} source={appearance.source} size={selectedId === pin.id ? 21 : 18} strokeWidth={2.4} />
      </button>;
    })}
  </div>;
};

export default WorldPinLayer;
