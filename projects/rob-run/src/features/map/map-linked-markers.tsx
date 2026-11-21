import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getFlightRouteColors } from "./map-flight-route-colors";
import { hasMapDefinition } from "./map-registry";
import MapSearchLocationIcon from "./map-search-location-icon";
import type { MapLocation, MapPoint } from "./types";

interface RouteControls {
  mapId: string;
  availableDestinationIds: ReadonlySet<string>;
  hiddenDestinationIds: string[];
  onToggle: (markerId: string) => void;
}

interface MapLinkedMarkersProps {
  links: readonly (NonNullable<MapLocation["linkedMarkers"]>[number] | {
    mapId: string;
    markerId: string;
    point: MapPoint;
  })[];
  titleKey: string;
  onOpenMap: (mapId: string, markerId: string) => void;
  routeControls?: RouteControls;
}

const MapLinkedMarkers = ({ links, titleKey, onOpenMap, routeControls }: MapLinkedMarkersProps) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const label = (link: MapLinkedMarkersProps["links"][number]) => "point" in link ? link.point.name : t(link.nameKey);
  const ordered = links.filter((link) => routeControls || hasMapDefinition(link.mapId)).sort((left, right) =>
    label(left).localeCompare(label(right)));
  if (!ordered.length) return null;
  const visible = expanded ? ordered : ordered.slice(0, 6);
  const routeColors = routeControls ? getFlightRouteColors(links) : null;
  const rowClass = "flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left text-[13px] font-medium text-zinc-100 transition-colors";
  return <section className="mt-4">
    <h3 className="map-micro-label mb-3">{t(titleKey)}</h3>
    <div className="space-y-2">
      {visible.map((link) => {
        const color = routeColors?.get(link.markerId);
        const canToggle = Boolean(color && link.mapId === routeControls?.mapId
          && routeControls?.availableDestinationIds.has(link.markerId));
        const active = !routeControls?.hiddenDestinationIds.includes(link.markerId);
        const routeLabel = label(link);
        const toggleLabel = t(active ? "map.flightPoints.hideRoute" : "map.flightPoints.showRoute",
          { name: routeLabel });
        if (routeControls) {
          if (!canToggle) return <div key={`${link.mapId}:${link.markerId}`}
            className={cn(rowClass, "text-zinc-400")}>
            <span className="min-w-0 leading-snug">{routeLabel}</span>
            <span className="shrink-0 text-[10px] text-zinc-500">{t("map.flightPoints.otherMap")}</span>
          </div>;
          return <button key={`${link.mapId}:${link.markerId}`} type="button"
            onClick={() => routeControls.onToggle(link.markerId)}
            aria-label={toggleLabel} title={toggleLabel} aria-pressed={active}
            className={cn(rowClass, "cursor-pointer hover:border-accent/55 hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-accent")}>
            <span className="min-w-0 leading-snug">{routeLabel}</span>
            <span className={cn("h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-opacity",
              !active && "opacity-55")}
              style={{ borderColor: color, backgroundColor: active ? color : "transparent" }} />
          </button>;
        }
        return <button key={`${link.mapId}:${link.markerId}`} type="button"
          onClick={() => onOpenMap(link.mapId, link.markerId)}
          className={cn(rowClass, "cursor-pointer hover:border-accent/55 hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-accent")}>
          <span className="flex min-w-0 items-center gap-2 leading-snug">
            {"point" in link && <MapSearchLocationIcon point={link.point} compact />}
            {routeLabel}
          </span>
          <ChevronRight size={14} className="shrink-0 text-accent" aria-hidden="true" />
        </button>;
      })}
    </div>
    {!expanded && ordered.length > 6 && <button type="button"
      onClick={() => setExpanded(true)}
      className="mt-2 w-full cursor-pointer rounded-lg px-3 py-2 text-center text-[12px] font-semibold text-accent transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
      {t("reference.showMore", { count: ordered.length - 6 })}
    </button>}
  </section>;
};

export default MapLinkedMarkers;
