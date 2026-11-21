import { ArrowUpDown, DoorOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getClimbHeight } from "./map-climb-height";
import type { MapSearchIndexLocation } from "./types";

interface MapTransitionProfileProps {
  /** Either `transition` or `vertical-access`; the copy differs per category. */
  category: string;
  /** Extracted object name; climbable objects encode their height in it. */
  internalName?: string;
  /** Verified portal destinations for this passage, empty when none is known. */
  destinations: MapSearchIndexLocation[];
  onSelect: (location: MapSearchIndexLocation) => void;
}

/**
 * Explains what a passage marker is and, when the extracted portal data pairs
 * it with another location, names where it leads as a link into that map.
 */
const MapTransitionProfileSection = ({ category, internalName, destinations, onSelect }: MapTransitionProfileProps) => {
  const { t } = useTranslation();
  const vertical = category === "vertical-access";
  const climbHeight = getClimbHeight(internalName);

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-transition-profile-title">
      <div className="flex items-center gap-2">
        {vertical
          ? <ArrowUpDown size={13} className="text-accent" aria-hidden="true" />
          : <DoorOpen size={13} className="text-accent" aria-hidden="true" />}
        <h4 id="map-transition-profile-title">
          {t(vertical ? "map.transition.verticalTitle" : "map.transition.title")}
        </h4>
      </div>

      <p className="map-dialogue-hint">
        {t(vertical ? "map.transition.verticalHint" : "map.transition.hint")}
      </p>

      {destinations.length === 0 && vertical ? (
        <p className="map-dialogue-hint">
          {climbHeight !== undefined
            ? t("map.transition.climb", { height: climbHeight })
            : t("map.transition.localClimb")}
        </p>
      ) : destinations.length > 0 ? (
        <p className="map-dialogue-hint">
          {t("map.transition.leadsTo")}{" "}
          {destinations.map((location, index) => (
            <span key={`${location.mapId}:${location.id}`}>
              {index > 0 && <span aria-hidden="true">{", "}</span>}
              <button
                type="button"
                onClick={() => onSelect(location)}
                aria-label={t("map.relationships.openConnection", {
                  name: location.name,
                  map: location.mapName,
                })}
                className="cursor-pointer font-semibold text-accent underline decoration-accent/45 underline-offset-2 transition-colors hover:decoration-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {location.name}
              </button>
              <span className="text-white/45">{` (${location.mapName})`}</span>
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
};

export default MapTransitionProfileSection;
