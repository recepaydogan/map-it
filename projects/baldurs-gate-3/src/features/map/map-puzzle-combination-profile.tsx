import { ArrowUpRight, Puzzle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapPuzzleCombinationProfile, MapSearchIndexLocation } from "./types";

interface MapPuzzleCombinationProfileProps {
  profile: MapPuzzleCombinationProfile;
  locations: MapSearchIndexLocation[];
  onSelect: (location: MapSearchIndexLocation) => void;
}

const MapPuzzleCombinationProfileSection = ({ profile, locations, onSelect }: MapPuzzleCombinationProfileProps) => {
  const { t } = useTranslation();
  const receptacle = profile.role === "receptacle";
  const locationByContentId = new Map<string, MapSearchIndexLocation[]>();
  for (const location of locations) {
    if (!location.contentId) continue;
    const matches = locationByContentId.get(location.contentId) ?? [];
    matches.push(location);
    locationByContentId.set(location.contentId, matches);
  }

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-puzzle-combination-title">
      <div className="flex items-center gap-2">
        <Puzzle size={13} className="text-cyan-200" aria-hidden="true" />
        <h4 id="map-puzzle-combination-title">
          {t(receptacle ? "map.puzzleCombination.receptacleTitle" : "map.puzzleCombination.ingredientTitle")}
        </h4>
      </div>
      <div className="mt-2 grid gap-1.5">
        {profile.related.flatMap((related) => {
          const relatedLocations = locationByContentId.get(related.contentId) ?? [];
          const relationLabel = t(receptacle ? "map.puzzleCombination.requires" : "map.puzzleCombination.usedAt");
          if (relatedLocations.length === 0) {
            return (
              <div key={related.combinationId} className="rounded-[var(--radius-md)] border border-white/8 bg-white/[0.025] px-2.5 py-2">
                <span className="block text-[10px] font-medium uppercase tracking-[0.1em] text-white/45">{relationLabel}</span>
                <strong className="mt-0.5 block text-[11px] font-semibold text-white">{related.title}</strong>
              </div>
            );
          }
          return relatedLocations.map((location) => (
            <button
              key={`${related.combinationId}:${location.mapId}:${location.id}`}
              type="button"
              onClick={() => onSelect(location)}
              className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-cyan-200/20 bg-cyan-200/[0.045] px-2.5 py-2 text-left transition-colors hover:border-cyan-200/45 hover:bg-cyan-200/[0.075] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-medium uppercase tracking-[0.1em] text-cyan-100/60">{relationLabel}</span>
                <strong className="mt-0.5 block truncate text-[11px] font-semibold text-white">{location.name || related.title}</strong>
                <span className="mt-0.5 block truncate text-[10px] text-white/55">{location.mapName}</span>
              </span>
              <ArrowUpRight size={13} className="shrink-0 text-cyan-200" aria-hidden="true" />
            </button>
          ));
        })}
      </div>
    </section>
  );
};

export default MapPuzzleCombinationProfileSection;
