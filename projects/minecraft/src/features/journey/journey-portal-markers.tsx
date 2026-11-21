import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { GAME_MAP_DIMENSIONS, GAME_OBSERVED_PORTAL_APPEARANCE } from "../../game-config";
import Tooltip from "../../components/tooltip";
import type { BiomeCanvasState } from "../generation/biome-canvas";
import { useWorldMapFrameView } from "../worlds/world-map-frame-context";
import { projectWorldPoint } from "../worlds/world-polyline-projection";
import { WORLD_STRUCTURE_ICON_SIZE, WORLD_STRUCTURE_MARKER_SIZE } from "../worlds/world-structure-marker-size";
import type { JourneyDimensionTransition } from "./journey-dimension-transitions";
import type { ObservedJourneyPortal } from "./journey-observed-portals";

const JourneyPortalMarkers = ({ links, dimension, view: settledView, onFollow, onSelect, selectedId }: {
  links: readonly ObservedJourneyPortal[];
  dimension: string;
  view: BiomeCanvasState | null;
  onFollow?: (target: JourneyDimensionTransition["to"]) => void;
  onSelect?: (link: ObservedJourneyPortal) => void;
  selectedId?: string | null;
}) => {
  const { t } = useTranslation();
  const view = useWorldMapFrameView(settledView);
  const markers = useMemo(() => links.flatMap(link => {
    const current = link.transition.from.dimension === dimension ? link.transition.from
      : link.transition.to.dimension === dimension ? link.transition.to : null;
    if (!current) return [];
    const opposite = current === link.transition.from ? link.transition.to : link.transition.from;
    const position = projectWorldPoint(current.point, view);
    return position ? [{ ...link, current, opposite, position }] : [];
  }), [links, dimension, view]);
  const dimensionName = (id: string) => t(GAME_MAP_DIMENSIONS.find(item => item.id === id)?.labelKey ?? id);
  return markers.map(marker => <Tooltip key={marker.id} label={t("journeyHistory.linkedPortal")}
      side={marker.position.y < 64 ? "bottom" : "top"}
      align={view && marker.position.x < 160 ? "start" : view && marker.position.x > view.width - 160 ? "end" : "center"}
      className="absolute z-[11] -translate-x-1/2 -translate-y-1/2"
      style={{ left: marker.position.x, top: marker.position.y }}>
    <button type="button" data-observed-portal={marker.id}
      aria-label={t("journeyHistory.portalMarker", { dimension: dimensionName(marker.opposite.dimension) })}
      aria-pressed={selectedId === marker.id}
      onClick={() => onSelect ? onSelect(marker) : onFollow?.(marker.opposite)}
      style={{ width: WORLD_STRUCTURE_MARKER_SIZE, height: WORLD_STRUCTURE_MARKER_SIZE }}
      className="grid cursor-pointer place-items-center rounded-[var(--radius-md)] border border-[#a267cb] bg-[#191121] shadow-[var(--panel-shadow)] hover:border-[#d49af6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
      <img src={GAME_OBSERVED_PORTAL_APPEARANCE.artwork} alt="" width={WORLD_STRUCTURE_ICON_SIZE} height={WORLD_STRUCTURE_ICON_SIZE}
        style={{ width: WORLD_STRUCTURE_ICON_SIZE, height: WORLD_STRUCTURE_ICON_SIZE }} className="[image-rendering:pixelated]" />
    </button>
  </Tooltip>);
};

export default JourneyPortalMarkers;
