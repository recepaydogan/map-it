import { Hammer, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapCrechePuzzleProfile } from "./types";

const MapCrechePuzzleProfileSection = ({ profile }: { profile: MapCrechePuzzleProfile }) => {
  const { t } = useTranslation();

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-creche-puzzle-title">
      <div className="map-dialogue-section-heading">
        {profile.kind === "statues" ? <Sun size={14} aria-hidden="true" /> : <Hammer size={14} aria-hidden="true" />}
        <h4 id="map-creche-puzzle-title">{profile.title}</h4>
      </div>
      {profile.kind === "statues" ? (
        <>
          <p className="map-dialogue-hint">{t("map.crechePuzzle.statueHint", { degrees: profile.rotationStepDegrees })}</p>
          <ul className="map-puzzle-steps">
            {profile.statues.map((statue) => (
              <li key={statue.contentId}>
                <strong>{statue.title}</strong>
                <p>{t(statue.role === "sunrise" ? "map.crechePuzzle.faceEast" : "map.crechePuzzle.faceWest")}</p>
              </li>
            ))}
          </ul>
          <p className="map-dialogue-hint">{t("map.crechePuzzle.stuckStatue", {
            damage: profile.stuckSunsetSolutions.minimumDamage,
            dc: profile.stuckSunsetSolutions.athleticsDc,
          })}</p>
        </>
      ) : (
        <>
          <p className="map-dialogue-hint">{t("map.crechePuzzle.weaponHint")}</p>
          <ul className="map-puzzle-steps">
            {profile.pedestals.map((pedestal) => (
              <li key={pedestal.index}>
                <div className="flex items-center justify-between gap-3">
                  <strong>{pedestal.plaqueTitle}</strong>
                  {pedestal.preSolved && <span className="map-dialogue-tag">{t("map.crechePuzzle.preSolved")}</span>}
                </div>
                <p>{pedestal.weaponType} · {pedestal.ceremonialWeaponTitle}</p>
              </li>
            ))}
          </ul>
          <p className="map-dialogue-hint">{t("map.crechePuzzle.wrongWeaponPenalty", {
            damage: profile.incorrectWeaponPenalty.damage,
            type: profile.incorrectWeaponPenalty.damageType,
            duration: profile.incorrectWeaponPenalty.knockdownDuration,
          })}</p>
          <p className="map-dialogue-hint">{t("map.crechePuzzle.rewardHint")}</p>
        </>
      )}
    </section>
  );
};

export default MapCrechePuzzleProfileSection;
