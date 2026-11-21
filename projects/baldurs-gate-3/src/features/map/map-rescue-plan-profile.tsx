import { AlarmClock, DoorOpen, EyeOff, UsersRound, Waves } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapRescuePlanProfile, MapSpoilerLevel } from "./types";

interface MapRescuePlanProfileProps {
  level: MapSpoilerLevel;
  profile: MapRescuePlanProfile;
}

const MapRescuePlanProfileSection = ({ level, profile }: MapRescuePlanProfileProps) => {
  const { t } = useTranslation();
  const fixedHostages = profile.hostages.filter((hostage) => !hostage.conditional);
  const conditionalHostages = profile.hostages.filter((hostage) => hostage.conditional);

  return (
    <div className="map-rescue-plan-profile">
      <div className="flex items-center gap-2">
        <AlarmClock size={13} className="text-accent" aria-hidden="true" />
        <h4>{t("map.spoilers.rescuePlan.title")}</h4>
      </div>
      {level === "hint" && (
        <p className="map-rescue-plan-locked">
          <EyeOff size={12} aria-hidden="true" />
          {t("map.spoilers.rescuePlan.hidden")}
        </p>
      )}

      {(level === "guide" || level === "full") && (
        <>
          <p className="map-rescue-plan-section-label">{t("map.spoilers.rescuePlan.turnBudget")}</p>
          <dl className="map-rescue-plan-turns">
            {(["easy", "medium", "hard"] as const).map((difficulty) => (
              <div key={difficulty}>
                <dt>{t(`map.spoilers.rescuePlan.difficulties.${difficulty}`)}</dt>
                <dd>{t("map.spoilers.rescuePlan.turns", { count: profile.turnLimits[difficulty] })}</dd>
              </div>
            ))}
          </dl>

          {profile.currentHostage && (
            <div className="map-rescue-plan-current">
              <UsersRound size={13} aria-hidden="true" />
              <div>
                <strong>{profile.currentHostage.title}</strong>
                <p>{t("map.spoilers.rescuePlan.group", { value: profile.currentHostage.group })}</p>
                {profile.currentHostage.conditional && <small>{t("map.spoilers.rescuePlan.conditional")}</small>}
              </div>
            </div>
          )}

          {profile.role === "escape" && (
            <div className="map-rescue-plan-current">
              <DoorOpen size={13} aria-hidden="true" />
              <div>
                <strong>{t("map.spoilers.rescuePlan.escape")}</strong>
                <p>{t("map.spoilers.rescuePlan.escapeHint")}</p>
              </div>
            </div>
          )}

          <p className="map-rescue-plan-flood">
            <Waves size={13} aria-hidden="true" />
            {t("map.spoilers.rescuePlan.flood", { turn: profile.floodTurn, count: profile.floodPositionCount })}
          </p>
        </>
      )}

      {level === "full" && (
        <div className="map-rescue-plan-roster">
          <p className="map-rescue-plan-section-label">{t("map.spoilers.rescuePlan.roster")}</p>
          <ul>
            {fixedHostages.map((hostage) => (
              <li key={hostage.id}>
                <span>{hostage.title}</span>
                <small>{t("map.spoilers.rescuePlan.groupShort", { value: hostage.group })}</small>
              </li>
            ))}
          </ul>
          <p className="map-rescue-plan-section-label">{t("map.spoilers.rescuePlan.conditionalRoster")}</p>
          <ul>
            {conditionalHostages.map((hostage) => (
              <li key={hostage.id}>
                <span>{hostage.title}</span>
                <small>{t("map.spoilers.rescuePlan.groupShort", { value: hostage.group })}</small>
              </li>
            ))}
          </ul>
          <p className="map-rescue-plan-caveat">{t("map.spoilers.rescuePlan.offlineCaveat")}</p>
        </div>
      )}
    </div>
  );
};

export default MapRescuePlanProfileSection;
