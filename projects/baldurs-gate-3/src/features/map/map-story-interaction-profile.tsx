import { MousePointerClick } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapStoryInteractionProfile } from "./types";

const MapStoryInteractionProfileSection = ({ profile }: { profile: MapStoryInteractionProfile }) => {
  const { t } = useTranslation();

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-story-interaction-title">
      <div className="map-dialogue-section-heading">
        <MousePointerClick size={14} aria-hidden="true" />
        <h4 id="map-story-interaction-title">{t("map.storyInteraction.title")}</h4>
      </div>
      <div className="mt-2 space-y-1.5">
        {profile.outcomes.map((outcome, index) => {
          const detail = "targetTitle" in outcome ? outcome.targetTitle : undefined;
          return (
            <div key={`${outcome.kind}:${"stateId" in outcome ? outcome.stateId : detail}:${index}`} className="rounded-lg border border-cyan-200/10 bg-cyan-200/[0.04] px-2.5 py-2">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-cyan-100/60">
                {t(`map.storyInteraction.actions.${outcome.kind}`)}
              </span>
              {detail && <strong className="mt-0.5 block text-[11px] text-white">{detail}</strong>}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default MapStoryInteractionProfileSection;
