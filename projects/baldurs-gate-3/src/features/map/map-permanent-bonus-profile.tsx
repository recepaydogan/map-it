import { BadgeCheck, EyeOff, Sparkles, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapAbility, MapPermanentBonusProfile, MapSpoilerLevel } from "./types";

interface MapPermanentBonusProfileProps {
  level: MapSpoilerLevel;
  profile: MapPermanentBonusProfile;
}

const MapPermanentBonusProfileSection = ({ level, profile }: MapPermanentBonusProfileProps) => {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? "en";
  const abilityLabel = (ability: MapAbility) => t(`map.spoilers.permanentBonuses.abilities.${ability}`);

  return (
    <div className="map-permanent-bonus-profile">
      <div className="flex items-center gap-2">
        <Sparkles size={13} className="text-accent" aria-hidden="true" />
        <h4>{t("map.spoilers.permanentBonuses.title")}</h4>
      </div>
      {level === "hint" && (
        <p className="map-permanent-bonus-locked">
          <EyeOff size={12} aria-hidden="true" />
          {t("map.spoilers.permanentBonuses.hidden")}
        </p>
      )}

      {(level === "guide" || level === "full") && profile.interactions.map((interaction) => {
        const checkGroups = [...interaction.checks.reduce((groups, check) => {
          const key = `${check.skill ?? check.ability ?? "check"}:${check.difficultyClass ?? "?"}`;
          if (!groups.has(key)) groups.set(key, check);
          return groups;
        }, new Map<string, (typeof interaction.checks)[number]>()).values()];
        const exactChecks = [...interaction.checks.reduce((groups, check) => {
          const text = check.localizedText?.[language] ?? check.localizedText?.en ?? "";
          const key = `${check.skill ?? check.ability}:${check.difficultyClass}:${text}`;
          if (!groups.has(key)) groups.set(key, check);
          return groups;
        }, new Map<string, (typeof interaction.checks)[number]>()).values()];

        return (
          <article key={interaction.id} className="map-permanent-bonus-interaction">
            <p className="map-permanent-bonus-section-label">{t("map.spoilers.permanentBonuses.boons")}</p>
            <ul className="map-permanent-bonus-boons">
              {interaction.boons.map((boon) => (
                <li key={boon.passiveId}>
                  <strong>+{boon.amount} {abilityLabel(boon.ability)}</strong>
                  <span>{t("map.spoilers.permanentBonuses.maximum", { value: boon.maximum })}</span>
                </li>
              ))}
            </ul>
            <p className="map-permanent-bonus-prayer">
              {t("map.spoilers.permanentBonuses.prayerBonus", { value: interaction.prayerMemoryRollBonus })}
            </p>

            <p className="map-permanent-bonus-section-label">{t("map.spoilers.permanentBonuses.routes")}</p>
            <ul className="map-permanent-bonus-checks">
              {(level === "full" ? exactChecks : checkGroups).map((check) => (
                <li key={`${check.id}:${level}`}>
                  <div>
                    <BadgeCheck size={11} aria-hidden="true" />
                    <strong>{check.skill ?? check.ability ?? t("map.spoilers.permanentBonuses.check")}</strong>
                    {check.difficultyClass !== undefined && <span>{t("map.spoilers.permanentBonuses.dc", { value: check.difficultyClass })}</span>}
                  </div>
                  {level === "full" && <p>{check.localizedText?.[language] ?? check.localizedText?.en}</p>}
                </li>
              ))}
            </ul>

            {level === "full" && (
              <div className="map-permanent-bonus-warning">
                <TriangleAlert size={13} aria-hidden="true" />
                <div>
                  <strong>{t("map.spoilers.permanentBonuses.costTitle")}</strong>
                  <p>{t("map.spoilers.permanentBonuses.cost", { count: interaction.sacrifices.length })}</p>
                  <p>{t("map.spoilers.permanentBonuses.forbiddenKnowledge")}</p>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
};

export default MapPermanentBonusProfileSection;
