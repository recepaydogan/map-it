import { Gauge, RotateCcw, Waves } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapMinscSluicePuzzleProfile } from "./types";

const MapMinscSluicePuzzleProfileSection = ({ profile }: { profile: MapMinscSluicePuzzleProfile }) => {
  const { t } = useTranslation();
  const stageDuration = profile.valves[0]?.stages.find(({ stage }) => stage === profile.solutionStage)?.durationSeconds ?? 0;

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-minsc-sluice-title">
      <div className="map-dialogue-section-heading">
        <Waves size={14} aria-hidden="true" />
        <h4 id="map-minsc-sluice-title">{profile.title}</h4>
      </div>

      <p className="map-dialogue-hint">
        {t("map.minscSluicePuzzle.solution", { stage: profile.solutionStage, seconds: stageDuration })}
      </p>

      <ul className="map-dialogue-events">
        {profile.valves.map((valve) => (
          <li key={valve.valveContentId}>
            <div className="flex items-center justify-between gap-3">
              <strong>{valve.valveTitle}</strong>
              <span className="map-dialogue-tag">
                {t("map.minscSluicePuzzle.increment", { seconds: valve.incrementSeconds })}
              </span>
            </div>
            <p>{valve.indicatorTitle}</p>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-start gap-2 text-[10px] leading-relaxed text-white/60">
        <Gauge size={13} className="mt-0.5 shrink-0 text-cyan-300" aria-hidden="true" />
        <p>{t("map.minscSluicePuzzle.elemental", {
          fire: profile.elementalAdjustment.heatDamageType,
          cold: profile.elementalAdjustment.coolDamageType,
          seconds: profile.elementalAdjustment.heatDurationSeconds,
        })}</p>
      </div>
      <div className="mt-2 flex items-start gap-2 text-[10px] leading-relaxed text-white/60">
        <RotateCcw size={13} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
        <p>{t("map.minscSluicePuzzle.overload", {
          overload: profile.overload.stage,
          reset: profile.overload.releaseToStage,
          release: profile.releaseValve.title,
        })}</p>
      </div>
      <p className="map-dialogue-hint">
        {t("map.minscSluicePuzzle.bypass", {
          skill: profile.forceCheck.skill,
          dc: profile.forceCheck.difficultyClass,
        })}
      </p>
      {profile.role === "disabled-valve" && <p className="map-dialogue-hint">{t("map.minscSluicePuzzle.disabled")}</p>}
    </section>
  );
};

export default MapMinscSluicePuzzleProfileSection;
