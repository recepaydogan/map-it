import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { requestMapDestinationInMain } from "../map/map-window-bridge";
import { isCurrentTravelDestination } from "./travel-destination-context";
import { ReferenceLocationContext } from "./reference-location-context";
import type { ReferenceEntry, ReferenceLocation } from "./reference-types";

const TravelDestination = ({ entry, currentMarker }: { entry: ReferenceEntry; currentMarker?: Pick<ReferenceLocation, "mapId" | "markerId"> }) => {
  const { t } = useTranslation();
  const selectedMarker = useContext(ReferenceLocationContext);
  const sourceMarker = currentMarker ?? selectedMarker;
  const matchingSource = sourceMarker && entry.locations.find((location) =>
    location.mapId === sourceMarker.mapId && location.markerId === sourceMarker.markerId);
  const portalSource = matchingSource ?? (entry.locations.length === 1 ? entry.locations[0] : undefined);
  const returnTo = entry.travel?.kind === "portal" && portalSource
    ? { mapId: portalSource.mapId, markerId: portalSource.markerId } : undefined;
  const name = entry.travel?.kind === "rift" || entry.travel?.kind === "portal" ? entry.travel.destinationName ?? entry.name : entry.name;
  const arrival = entry.arrival;
  const points = arrival?.points.filter((point): point is typeof point & { x: number; y: number } =>
    Number.isFinite(point.x) && Number.isFinite(point.y)) ?? [];
  const buttonClassName = "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-border bg-white/[0.025] px-3.5 py-3 text-left text-[13px] font-medium leading-relaxed text-zinc-200 transition-colors hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  if (isCurrentTravelDestination(entry, currentMarker)) return <div className="space-y-1">
    <p className="text-[14px] font-medium text-zinc-100">{name}</p>
    <p className="text-xs text-muted">{t("reference.travel.currentDestination")}</p>
  </div>;
  return <div className="space-y-2">
    {arrival?.mapId ? points.length ? points.map((point, index) => (
      <button key={point.actor} type="button" className={buttonClassName} onClick={() => requestMapDestinationInMain(arrival.mapId!, { name, x: point.x, y: point.y, returnTo })}>
        <span>{points.length > 1 ? t("reference.travel.numberedDestination", { name, number: index + 1 }) : name}</span>
      </button>
    )) : <>
      <button type="button" className={buttonClassName} onClick={() => requestMapDestinationInMain(arrival.mapId!)}>
        <span>{t("reference.travel.openDestinationMap", { name })}</span>
      </button>
      {entry.travel?.kind !== "rift" && <p className="text-xs text-muted">{t("reference.travel.arrivalUnresolved")}</p>}
    </> : <><p className="text-[14px] font-medium text-zinc-100">{name}</p><p className="text-xs text-muted">{t("reference.travel.destinationMapUnavailable")}</p></>}
  </div>;
};

export default TravelDestination;
