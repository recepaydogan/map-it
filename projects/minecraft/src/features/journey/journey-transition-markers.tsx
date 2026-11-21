import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GAME_MAP_DIMENSIONS } from "../../game-config";
import type { BiomeCanvasState } from "../generation/biome-canvas";
import { visibleJourneyTransitions, type JourneyDimensionTransition,
  type JourneyTransitionSide } from "./journey-dimension-transitions";
import type { PortalProjectionRule } from "./journey-observed-portals";
import type { WorldJourney } from "./journey-state";

const JourneyTransitionMarkers = ({ journey, dimension, view, selectedIndex, onSelect, excludedPairs = [] }: {
  journey: WorldJourney | null | undefined; dimension: string; view: BiomeCanvasState | null;
  selectedIndex: number | null;
  onSelect: (transition: JourneyDimensionTransition, side: JourneyTransitionSide) => void;
  excludedPairs?: readonly PortalProjectionRule[];
}) => {
  const { t } = useTranslation();
  const markers = visibleJourneyTransitions(journey, dimension, view).filter(({ transition }) =>
    !excludedPairs.some(pair => pair.sourceDimension === transition.from.dimension
      && pair.targetDimension === transition.to.dimension));
  const dimensionName = (id: string) => t(GAME_MAP_DIMENSIONS.find(item => item.id === id)?.labelKey ?? id);
  return markers.map(({ transition, side, position }) => {
      const from = dimensionName(transition.from.dimension), to = dimensionName(transition.to.dimension);
      return <button key={`${transition.index}:${side}`} type="button"
        aria-label={t(side === "arrival" ? "journeyHistory.transitionFrom" : "journeyHistory.transitionTo",
          { dimension: side === "arrival" ? from : to })}
        data-journey-transition data-transition-side={side}
        aria-pressed={selectedIndex === transition.index}
        onClick={() => onSelect(transition, side)}
        style={{ left: position.x, top: position.y }}
        className="absolute z-[11] flex -translate-x-1/2 -translate-y-[calc(100%+16px)] cursor-pointer items-center gap-1 rounded-[var(--radius-full)] border border-accent/70 bg-surface/95 px-2 py-1 text-[10px] font-semibold text-white shadow-[var(--panel-shadow)] hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
        {side === "arrival" ? <ArrowDownLeft size={13} className="shrink-0 text-accent" aria-hidden="true" />
          : <ArrowUpRight size={13} className="shrink-0 text-accent" aria-hidden="true" />}
        <span className="max-w-28 truncate">{t(side === "arrival" ? "journeyHistory.transitionFrom" : "journeyHistory.transitionTo",
          { dimension: side === "arrival" ? from : to })}</span>
        <span className="absolute left-1/2 top-full h-4 w-px -translate-x-1/2 bg-accent/70" aria-hidden="true" />
      </button>;
    });
};

export default JourneyTransitionMarkers;
