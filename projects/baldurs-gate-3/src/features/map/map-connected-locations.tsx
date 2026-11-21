import { ArrowUpRight, DoorOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapSearchIndexLocation } from "./types";

interface MapConnectedLocationsProps {
  locations: MapSearchIndexLocation[];
  onSelect: (location: MapSearchIndexLocation) => void;
}

/** Verified cross-map passages are separate from uncertain same-name matches. */
const MapConnectedLocations = ({ locations, onSelect }: MapConnectedLocationsProps) => {
  const { t } = useTranslation();
  if (locations.length === 0) return null;

  return (
    <section className="map-connected-locations" aria-labelledby="map-connected-locations-title">
      <header className="flex items-start gap-2">
        <DoorOpen size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <h3 id="map-connected-locations-title" className="text-[12px] font-semibold text-white">
            {t("map.relationships.connectedTitle")}
          </h3>
        </div>
      </header>
      <div className="mt-2 grid gap-1.5">
        {locations.map((location) => {
          return (
            <button
              key={`${location.mapId}:${location.id}`}
              type="button"
              onClick={() => onSelect(location)}
              aria-label={t("map.relationships.openConnection", {
                name: location.name,
                map: location.mapName,
              })}
              className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-accent/25 bg-accent/8 px-2.5 py-2 text-left transition-colors hover:border-accent/55 hover:bg-accent/12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[11px] font-semibold text-white">{location.name}</strong>
                <span className="mt-0.5 block truncate text-[10px] text-white/70">{location.mapName}</span>
              </span>
              <ArrowUpRight size={13} className="shrink-0 text-accent" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default MapConnectedLocations;
