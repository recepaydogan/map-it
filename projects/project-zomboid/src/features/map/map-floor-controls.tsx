import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

interface MapFloorControlsProps {
  activeFloor: number;
  floors: number[];
  onFloorChange: (floor: number) => void;
  compact?: boolean;
}

const MapFloorControls = ({
  activeFloor,
  floors,
  onFloorChange,
  compact = false,
}: MapFloorControlsProps) => {
  const { t } = useTranslation();
  const activeIndex = floors.indexOf(activeFloor);
  const lowerFloor = activeIndex > 0 ? floors[activeIndex - 1] : undefined;
  const upperFloor = activeIndex >= 0 && activeIndex < floors.length - 1
    ? floors[activeIndex + 1]
    : undefined;
  const formatFloor = (floor: number) => {
    if (floor === 0) return t("map.view.ground");
    if (floor > 0) return t("map.view.level", { number: floor });
    return t("map.view.basement", { number: Math.abs(floor) });
  };
  const floorValue = activeFloor === 0
    ? t("map.view.shortGround")
    : activeFloor > 0
      ? t("map.view.shortLevel", { number: activeFloor })
      : t("map.view.shortBasement", { number: Math.abs(activeFloor) });
  const upperFloorLabel = formatFloor(upperFloor ?? activeFloor);
  const lowerFloorLabel = formatFloor(lowerFloor ?? activeFloor);
  const chevronSize = compact ? 14 : 16;

  return (
    <div
      className={cn("map-floor-controls", compact && "map-floor-controls-overlay")}
      role="group"
      aria-label={t("map.view.open")}
      data-map-ui
      data-tour="floor-controls"
    >
      <button
        type="button"
        disabled={upperFloor === undefined}
        onClick={() => upperFloor !== undefined && onFloorChange(upperFloor)}
        aria-label={upperFloorLabel}
        title={upperFloorLabel}
      >
        <ChevronUp size={chevronSize} strokeWidth={2.2} aria-hidden="true" />
      </button>

      <output
        className="map-floor-controls-active"
        aria-label={formatFloor(activeFloor)}
        title={formatFloor(activeFloor)}
      >
        <strong>{floorValue}</strong>
      </output>

      <button
        type="button"
        disabled={lowerFloor === undefined}
        onClick={() => lowerFloor !== undefined && onFloorChange(lowerFloor)}
        aria-label={lowerFloorLabel}
        title={lowerFloorLabel}
      >
        <ChevronDown size={chevronSize} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </div>
  );
};

export default MapFloorControls;
