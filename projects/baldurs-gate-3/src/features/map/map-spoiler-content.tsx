import { useTranslation } from "react-i18next";
import MapPermanentBonusProfileSection from "./map-permanent-bonus-profile";
import MapQuestProfileSection from "./map-quest-profile";
import MapRescuePlanProfileSection from "./map-rescue-plan-profile";
import MapStoryRiskProfileSection from "./map-story-risk-profile";
import type { MapContentEntity, MapSearchIndexLocation, MapSpoilerLevel } from "./types";
import MapWorldCheckProfileSection from "./map-world-check-profile";

/** Useful world and quest context only; dialogue, choices and approval are deliberately not published. */
interface MapLocationIntelligenceProps {
  content: MapContentEntity;
  mapId: string;
  questLocations: MapSearchIndexLocation[];
  onSelectLocation: (location: MapSearchIndexLocation) => void;
}

const MapLocationIntelligence = ({
  content,
  mapId,
  questLocations,
  onSelectLocation,
}: MapLocationIntelligenceProps) => {
  const { t } = useTranslation();
  // The game description is already shown as the panel intro, so it is not
  // repeated as an intelligence block here.
  const visibleBlocks = content.spoilerBlocks.filter((block) =>
    block.level !== "full" && !block.id.endsWith(":game-description"));
  const guideLevel: MapSpoilerLevel = "guide";

  if (
    visibleBlocks.length === 0
    && !content.quest
    && !content.worldChecks
    && !content.storyRisks
    && !content.permanentBonuses
    && !content.rescuePlan
  ) return null;

  return (
    <div className="map-location-intelligence">
      {visibleBlocks.map((block) => (
        <article key={block.id} className="map-location-intelligence-block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            {block.title || t("map.spoilers.gameDescription")}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-subtle">{block.body}</p>
        </article>
      ))}

      {content.permanentBonuses && (
        <MapPermanentBonusProfileSection level={guideLevel} profile={content.permanentBonuses} />
      )}
      {content.rescuePlan && <MapRescuePlanProfileSection level={guideLevel} profile={content.rescuePlan} />}
      {content.storyRisks && <MapStoryRiskProfileSection level={guideLevel} profile={content.storyRisks} />}
      {content.quest && (
        <MapQuestProfileSection
          contentId={content.id}
          mapId={mapId}
          level={guideLevel}
          quest={content.quest}
          locations={questLocations}
          onSelectLocation={onSelectLocation}
        />
      )}
      {content.worldChecks && <MapWorldCheckProfileSection level={guideLevel} profile={content.worldChecks} />}
    </div>
  );
};

export default MapLocationIntelligence;
