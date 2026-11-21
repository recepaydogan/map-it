import { useEffect } from "react";
import { ArrowRight, FlagTriangleRight, MapPin, Skull, Waypoints, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GAME_MAP_DIMENSIONS, GAME_OBSERVED_PORTAL_APPEARANCE } from "../../game-config";
import WorldCoordinateCopy from "../worlds/world-coordinate-copy";
import type { JourneyDimensionTransition, JourneyTransitionSide } from "./journey-dimension-transitions";
import type { ObservedJourneyPortal } from "./journey-observed-portals";
import type { JourneyPoint } from "./journey-state";

export type JourneyMarkerSelection =
  | { kind: "start" | "finish" | "death"; point: JourneyPoint }
  | { kind: "transition"; transition: JourneyDimensionTransition; side: JourneyTransitionSide }
  | { kind: "portal"; portal: ObservedJourneyPortal };

const JourneyMarkerDetails = ({ selection, dimension, onClose, onFollow }: {
  selection: JourneyMarkerSelection;
  dimension: string;
  onClose: () => void;
  onFollow: (target: JourneyDimensionTransition["to"]) => void;
}) => {
  const { t } = useTranslation();
  const dimensionName = (id: string) => t(GAME_MAP_DIMENSIONS.find(item => item.id === id)?.labelKey ?? id);
  const crossing = selection.kind === "portal" ? selection.portal.transition
    : selection.kind === "transition" ? selection.transition : null;
  const title = selection.kind === "portal" ? t("journeyHistory.linkedPortal")
    : selection.kind === "transition" ? t("journeyHistory.dimensionChange")
      : t(selection.kind === "start" ? "journeyHistory.start" : selection.kind === "death" ? "journeyHistory.died" : "journeyHistory.end");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopImmediatePropagation(); onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const position = (point: JourneyPoint) => ({ x: Math.floor(point.x), y: Math.floor(point.y), z: Math.floor(point.z) });
  return <section data-map-ui aria-label={title}
    className="world-pin-panel absolute left-4 top-20 z-[70] flex max-h-[calc(100%-8rem)] w-[min(360px,calc(100%-2rem))] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/95 shadow-[var(--panel-shadow)] backdrop-blur-xl">
    <header className="relative flex shrink-0 items-start gap-3 border-b border-border bg-black/15 p-4">
      <span className="map-details-icon shrink-0">{selection.kind === "portal"
        ? <img src={GAME_OBSERVED_PORTAL_APPEARANCE.artwork} alt="" className="h-9 w-9 [image-rendering:pixelated]" />
        : selection.kind === "start" ? <MapPin size={22} className="text-accent" aria-hidden="true" />
          : selection.kind === "death" ? <Skull size={22} className="text-danger-text" aria-hidden="true" />
            : selection.kind === "finish" ? <FlagTriangleRight size={22} className="text-accent" aria-hidden="true" />
              : <Waypoints size={22} className="text-accent" aria-hidden="true" />}</span>
      <div className="min-w-0 flex-1 pr-6"><h2 className="text-base font-semibold text-white">{title}</h2>
        <p className="mt-1 text-xs text-zinc-400">{dimensionName(dimension)}</p></div>
      <button type="button" onClick={onClose} className="map-icon-button absolute right-3 top-3" aria-label={t("chrome.close")}><X size={16} /></button>
    </header>
    <div className="min-h-0 space-y-3 overflow-y-auto p-4">
      {crossing ? <>
        <p className="text-xs leading-5 text-zinc-300">{t(selection.kind === "portal"
          ? "journeyHistory.portalTravel" : "journeyHistory.dimensionTravel", {
          from: dimensionName(crossing.from.dimension), to: dimensionName(crossing.to.dimension),
        })}</p>
        {[crossing.from, crossing.to].map((side, index) => <div key={`${side.dimension}:${index}`} className="space-y-2">
          <h3 className="map-micro-label">{t(index === 0 ? "journeyHistory.departure" : "journeyHistory.destination", {
            dimension: dimensionName(side.dimension),
          })}</h3>
          <WorldCoordinateCopy point={position(side.point)} />
        </div>)}
        {selection.kind === "portal" && <p className="text-xs leading-5 text-zinc-400">{t("journeyHistory.portalObservationNote")}</p>}
        <button type="button" onClick={() => onFollow(crossing.to)}
          className="flex w-full cursor-pointer items-center justify-between rounded-[var(--radius-md)] border border-accent/35 bg-accent-soft px-3 py-2.5 text-left text-xs font-semibold text-zinc-100 hover:border-accent">
          {t("journeyHistory.goToDestination", { dimension: dimensionName(crossing.to.dimension) })}<ArrowRight size={15} className="shrink-0 text-accent" />
        </button>
      </> : "point" in selection && <WorldCoordinateCopy point={position(selection.point)} />}
    </div>
  </section>;
};

export default JourneyMarkerDetails;
