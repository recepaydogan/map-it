import { AlertTriangle, EyeOff, Hourglass, LockKeyhole } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapSpoilerLevel, MapStoryRiskProfile } from "./types";

interface MapStoryRiskProfileProps {
  level: MapSpoilerLevel;
  profile: MapStoryRiskProfile;
}

const MapStoryRiskProfileSection = ({ level, profile }: MapStoryRiskProfileProps) => {
  const { t } = useTranslation();
  const entryKey = (id: string, field: string) => `map.spoilers.storyRisks.entries.${id}.${field}`;

  return (
    <div className="map-story-risk-profile">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="shrink-0 text-warning" aria-hidden="true" />
        <h4>{t("map.spoilers.storyRisks.title")}</h4>
      </div>
      {level === "hint" && <p className="map-story-risk-hint">{t("map.spoilers.storyRisks.hint", { count: profile.riskCount })}</p>}

      {level === "hint" && (
        <p className="map-story-risk-locked">
          <EyeOff size={12} aria-hidden="true" />
          {t("map.spoilers.storyRisks.hidden")}
        </p>
      )}

      {(level === "guide" || level === "full") && (
        <div className="map-story-risk-list">
          {profile.risks.map((risk) => (
            <article key={risk.id}>
              <div>
                {risk.type === "rest-deadline"
                  ? <Hourglass size={13} aria-hidden="true" />
                  : <LockKeyhole size={13} aria-hidden="true" />}
                <strong>{level === "full"
                  ? t(entryKey(risk.id, "title"), { defaultValue: risk.title })
                  : t(`map.spoilers.storyRisks.types.${risk.type}`)}</strong>
              </div>
              <p>{t(entryKey(risk.id, level === "full" ? "consequence" : "timing"))}</p>
            </article>
          ))}
        </div>
      )}

      {level !== "hint" && (
        <p className="map-story-risk-caveat">{t("map.spoilers.storyRisks.offlineCaveat")}</p>
      )}
    </div>
  );
};

export default MapStoryRiskProfileSection;
