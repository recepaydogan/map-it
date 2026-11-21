import { useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GAME_MAP_DIMENSIONS, GAME_OBSERVED_PORTAL_APPEARANCE } from "../../game-config";
import type { JourneyDimensionTransition } from "../journey/journey-dimension-transitions";
import type { ObservedJourneyPortal } from "../journey/journey-observed-portals";
import WorldCoordinateCopy from "./world-coordinate-copy";

const WorldObservedPortalDetails = ({ portal, dimension, onClose, onBack, onFollow, onRemove }: {
  portal: ObservedJourneyPortal;
  dimension: string;
  onClose: () => void;
  onBack: () => void;
  onFollow: (target: JourneyDimensionTransition["to"]) => void;
  onRemove: () => Promise<void>;
}) => {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false), [failed, setFailed] = useState(false);
  const current = portal.transition.from.dimension === dimension ? portal.transition.from : portal.transition.to;
  const linked = current === portal.transition.from ? portal.transition.to : portal.transition.from;
  const dimensionName = (id: string) => t(GAME_MAP_DIMENSIONS.find(item => item.id === id)?.labelKey ?? id);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!pending) onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose, pending]);
  const remove = async () => {
    if (pending) return;
    setPending(true); setFailed(false);
    try { await onRemove(); }
    catch (error) { console.error("Portal marker removal failed", error); setFailed(true); }
    finally { setPending(false); }
  };
  return <section data-map-ui aria-label={t("journeyHistory.linkedPortal")}
    className="world-pin-panel absolute left-3 top-[3.75rem] z-[70] flex max-h-[calc(100%-8.5rem)] w-[min(360px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/95 shadow-[var(--panel-shadow)] backdrop-blur-xl">
    <button type="button" onClick={onBack} disabled={pending} className="flex shrink-0 items-center gap-1 px-4 pt-3 text-left text-xs font-medium text-white hover:text-accent disabled:opacity-50">
      <ChevronLeft size={15} aria-hidden="true" />{t("inspector.backTo", { label: t("structureMap.filters.title") })}
    </button>
    <header className="relative flex shrink-0 items-start gap-3 border-b border-border bg-black/15 p-4">
      <span className="map-details-icon shrink-0"><img src={GAME_OBSERVED_PORTAL_APPEARANCE.artwork} alt="" className="h-9 w-9 [image-rendering:pixelated]" /></span>
      <div className="min-w-0 flex-1 pr-6">
        <h2 className="text-base font-semibold text-white">{t("journeyHistory.linkedPortal")}</h2>
        <p className="mt-1 text-xs text-zinc-400">{t("map.markerGroups.travel")}</p>
      </div>
      <button type="button" onClick={onClose} disabled={pending} className="map-icon-button absolute right-3 top-3 disabled:opacity-50" aria-label={t("chrome.close")}><X size={16} /></button>
    </header>
    <div className="min-h-0 space-y-3 overflow-y-auto p-4">
      {[current, linked].map(side => <div key={side.dimension} className="space-y-2">
        <h3 className="map-micro-label">{dimensionName(side.dimension)}</h3>
        <WorldCoordinateCopy point={{ x: Math.floor(side.point.x), y: Math.floor(side.point.y), z: Math.floor(side.point.z) }} />
      </div>)}
      <p className="text-xs leading-5 text-zinc-400">{t("journeyHistory.portalObservationNote")}</p>
      <button type="button" onClick={() => onFollow(linked)} disabled={pending}
        className="flex w-full cursor-pointer items-center justify-between rounded-[var(--radius-md)] border border-accent/35 bg-accent-soft px-3 py-2.5 text-left text-xs font-semibold text-zinc-100 hover:border-accent disabled:opacity-50">
        {t("journeyHistory.showOtherSide", { dimension: dimensionName(linked.dimension) })}<ArrowRight size={15} className="shrink-0 text-accent" />
      </button>
      <button type="button" onClick={() => { void remove(); }} disabled={pending}
        className="map-danger-button disabled:cursor-wait disabled:opacity-50"><Trash2 size={14} />{t("journeyHistory.removePortal")}</button>
      {failed && <p role="alert" className="text-xs text-danger-text">{t("journeyHistory.removePortalFailed")}</p>}
    </div>
  </section>;
};

export default WorldObservedPortalDetails;
