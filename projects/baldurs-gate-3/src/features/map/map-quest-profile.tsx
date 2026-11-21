import { BookOpenCheck, EyeOff, Gauge, GitBranch, Sparkles, Target } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { findQuestMarkerLocation, splitTextAtMarker } from "./map-quest-navigation";
import type { MapQuestProfile, MapSearchIndexLocation, MapSpoilerLevel } from "./types";

const INITIAL_STEP_LIMIT = 8;

interface MapQuestProfileProps {
  contentId: string;
  mapId: string;
  level: MapSpoilerLevel;
  quest: MapQuestProfile;
  locations: MapSearchIndexLocation[];
  onSelectLocation: (location: MapSearchIndexLocation) => void;
}

const MapQuestProfileSection = ({
  contentId,
  mapId,
  level,
  quest,
  locations,
  onSelectLocation,
}: MapQuestProfileProps) => {
  const { t, i18n } = useTranslation();
  const [expandedContentId, setExpandedContentId] = useState<string | null>(null);
  const language = i18n.resolvedLanguage ?? "en";
  const expanded = expandedContentId === contentId;
  const localized = (values?: Record<string, string>) => values?.[language] ?? values?.en;
  const allSteps = quest.quests
    .flatMap((entry) => entry.objectives.flatMap((objective) => objective.steps))
    .filter((step) => localized(step.localizedDescriptions));
  const hasProgressionData = allSteps.some((step) => step.areaLevel || (step.experienceReward && step.experienceReward.name !== "Zero"));
  const visibleStepIds = new Set((expanded ? allSteps : allSteps.slice(0, INITIAL_STEP_LIMIT)).map((step) => step.guid));
  const hiddenStepCount = Math.max(0, allSteps.length - INITIAL_STEP_LIMIT);
  const rewardLabel = (name: string) => t(`map.spoilers.quest.rewardTiers.${name}`, {
    defaultValue: name.replace(/([a-z0-9])([A-Z])/g, "$1 $2"),
  });

  return (
    <div className="map-quest-profile">
      <div className="flex items-center gap-2">
        <BookOpenCheck size={14} className="shrink-0 text-subtle" aria-hidden="true" />
        <h4>{t("map.spoilers.quest.title")}</h4>
      </div>
      {level === "hint" && <ul className="map-quest-title-list">
        {quest.quests.map((entry) => (
          <li key={entry.id}>{localized(entry.localizedTitles) ?? entry.id}</li>
        ))}
      </ul>}

      {level === "hint" && (
        <p className="map-quest-locked">
          <EyeOff size={12} aria-hidden="true" />
          {t("map.spoilers.quest.hidden")}
        </p>
      )}

      {(level === "guide" || level === "full") && (
        <div className="map-quest-list">
          {level === "full" && allSteps.length > 0 && (
            <p className="map-quest-branch-hint">{t("map.spoilers.quest.branchHint")}</p>
          )}
          {quest.quests.map((entry) => (
            <article key={entry.id}>
              <h5>{localized(entry.localizedTitles) ?? entry.id}</h5>
              <div className="map-quest-objectives">
                {entry.objectives.map((objective) => (
                  <section key={objective.id}>
                    <div>
                      <Target size={11} aria-hidden="true" />
                      <p>
                        {(() => {
                          const description = localized(objective.localizedDescriptions)
                            ?? localized(objective.localizedMarkerTitles)
                            ?? t("map.spoilers.quest.objectiveFallback");
                          const markerTitle = localized(objective.localizedMarkerTitles);
                          const location = findQuestMarkerLocation({
                            locations,
                            markerTitle,
                            currentContentId: contentId,
                            currentMapId: mapId,
                          });
                          const parts = markerTitle ? splitTextAtMarker(description, markerTitle) : undefined;
                          if (!location || !parts) return description;
                          return (
                            <>
                              {parts.before}
                              <button
                                type="button"
                                className="map-dialogue-inline-link"
                                onClick={() => onSelectLocation(location)}
                              >
                                {parts.marker}
                              </button>
                              {parts.after}
                            </>
                          );
                        })()}
                      </p>
                    </div>
                    {level === "full" && objective.steps.some((step) => visibleStepIds.has(step.guid)) && (
                      <ul className="map-quest-journal-steps">
                        {objective.steps.filter((step) => visibleStepIds.has(step.guid)).map((step) => (
                          <li key={step.guid}>
                            <GitBranch size={10} aria-hidden="true" />
                            <div>
                              <span>{localized(step.localizedDescriptions)}</span>
                              {(step.areaLevel || (step.experienceReward && step.experienceReward.name !== "Zero")) && (
                                <div className="map-quest-step-metadata">
                                  {step.areaLevel && (
                                    <small>
                                      <Gauge size={9} aria-hidden="true" />
                                      {t("map.spoilers.quest.areaLevel", { level: step.areaLevel.entityLevel })}
                                    </small>
                                  )}
                                  {step.experienceReward && step.experienceReward.name !== "Zero" && (
                                    <small>
                                      <Sparkles size={9} aria-hidden="true" />
                                      {t("map.spoilers.quest.xpTier", { tier: rewardLabel(step.experienceReward.name) })}
                                    </small>
                                  )}
                                </div>
                              )}
                              {step.conditionalRules && step.conditionalRules.length > 0 && (
                                <ul className="map-quest-step-conditions">
                                  {step.conditionalRules.map((rule) => (
                                    <li key={rule.id}>
                                      {t(rule.expected
                                        ? "map.spoilers.quest.conditionPresent"
                                        : "map.spoilers.quest.conditionAbsent", {
                                        condition: rule.condition.title,
                                      })}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      {level === "full" && allSteps.length > 0 && (
        <>
          {hasProgressionData && <p className="map-quest-data-hint">{t("map.spoilers.quest.dataHint")}</p>}
          {hiddenStepCount > 0 && (
            <button
              type="button"
              className="map-dialogue-expand"
              onClick={() => setExpandedContentId(expanded ? null : contentId)}
            >
              {t(expanded ? "map.spoilers.quest.showLess" : "map.spoilers.quest.showMore", { count: hiddenStepCount })}
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default MapQuestProfileSection;
