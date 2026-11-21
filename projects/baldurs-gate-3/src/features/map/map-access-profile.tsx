import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapAccessProfile, MapSearchIndexLocation } from "./types";

interface MapAccessProfileProps {
  profile: MapAccessProfile;
  locations: MapSearchIndexLocation[];
  onSelect: (location: MapSearchIndexLocation) => void;
}

/** Exact key/lock relationships extracted from shared game-data key identifiers. */
const MapAccessProfileSection = ({ profile, locations, onSelect }: MapAccessProfileProps) => {
  const { t } = useTranslation();
  const lock = profile.role === "lock";
  const locationByContentId = new Map<string, MapSearchIndexLocation[]>();

  for (const location of locations) {
    if (!location.contentId) continue;
    const matches = locationByContentId.get(location.contentId) ?? [];
    matches.push(location);
    locationByContentId.set(location.contentId, matches);
  }

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-access-profile-title">
      <h4 id="map-access-profile-title">
        {t(lock ? "map.access.lockedTitle" : "map.access.keyTitle")}
      </h4>

      {lock && (
        <ul className="map-dialogue-groups">
          <li>
            <span>{t("map.access.state")}</span>
            <strong>{t("map.access.locked")}</strong>
          </li>
          {profile.difficultyClass !== undefined && (
            <li>
              <span>{t("map.access.lockpicking")}</span>
              <strong>{t("map.access.dc", { value: profile.difficultyClass })}</strong>
            </li>
          )}
        </ul>
      )}

      {profile.related.length > 0 && (
        <div className="mt-2 grid gap-1.5">
          {profile.related.flatMap((related) => {
            const relatedLocations = locationByContentId.get(related.contentId) ?? [];
            if (relatedLocations.length === 0) {
              return (
                <div
                  key={related.contentId}
                  className="rounded-[var(--radius-md)] border border-white/8 bg-white/[0.025] px-2.5 py-2"
                >
                  <span className="block text-[10px] font-medium uppercase tracking-[0.1em] text-white/45">
                    {t(lock ? "map.access.openedBy" : "map.access.opens")}
                  </span>
                  <strong className="mt-0.5 block text-[11px] font-semibold text-white">{related.title}</strong>
                </div>
              );
            }
            return relatedLocations.map((location) => (
              <button
                key={`${related.contentId}:${location.mapId}:${location.id}`}
                type="button"
                onClick={() => onSelect(location)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-amber-200/20 bg-amber-200/[0.045] px-2.5 py-2 text-left transition-colors hover:border-amber-200/45 hover:bg-amber-200/[0.075] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-medium uppercase tracking-[0.1em] text-amber-100/60">
                    {t(lock ? "map.access.openedBy" : "map.access.opens")}
                  </span>
                  <strong className="mt-0.5 block truncate text-[11px] font-semibold text-white">
                    {location.name || related.title}
                  </strong>
                  <span className="mt-0.5 block truncate text-[10px] text-white/55">{location.mapName}</span>
                </span>
                <ArrowUpRight size={13} className="shrink-0 text-amber-200" aria-hidden="true" />
              </button>
            ));
          })}
        </div>
      )}
    </section>
  );
};

export default MapAccessProfileSection;
