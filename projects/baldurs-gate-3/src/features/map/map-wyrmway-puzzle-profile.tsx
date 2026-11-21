import { ArrowRight, BrainCircuit } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapWyrmwayPuzzleProfile } from "./types";

const MapWyrmwayPuzzleProfileSection = ({ profile }: { profile: MapWyrmwayPuzzleProfile }) => {
  const { t } = useTranslation();
  const couragePhases = profile.kind === "courage"
    ? [...new Set(profile.enemies.map(({ phase }) => phase))].sort((left, right) => left - right)
    : [];

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-wyrmway-puzzle-title">
      <div className="map-dialogue-section-heading">
        <BrainCircuit size={14} aria-hidden="true" />
        <h4 id="map-wyrmway-puzzle-title">{profile.title}</h4>
      </div>
      {profile.kind === "chess" ? (
        <>
          <p className="map-dialogue-hint">{t("map.wyrmwayPuzzle.chessHint")}</p>
          <div className="mt-3 grid gap-2">
            {profile.variants.map(({ variant, moves }) => (
              <div key={variant} className="rounded-[var(--radius-md)] border border-white/8 bg-white/[0.025] px-2.5 py-2">
                <strong className="block text-[11px] text-white">{t("map.wyrmwayPuzzle.board", { number: variant })}</strong>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {moves.map((move) => (
                    <span key={move.step} className="inline-flex items-center gap-1 rounded-full border border-cyan-200/20 bg-cyan-200/[0.05] px-2 py-1 text-[10px] font-semibold text-cyan-100">
                      {move.step}. {move.from.notation}<ArrowRight size={10} aria-hidden="true" />{move.to.notation}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : profile.kind === "insight" ? (
        <>
          <p className="map-dialogue-hint">{t("map.wyrmwayPuzzle.insightHint")}</p>
          <ul className="map-dialogue-events">
            {profile.suspects.map((suspect) => (
              <li key={suspect.contentId} className={suspect.correct ? "border-emerald-300/25 bg-emerald-300/[0.045]" : undefined}>
                <div className="flex items-center justify-between gap-3">
                  <strong>{suspect.title}</strong>
                  <span className="map-dialogue-tag">{t(suspect.correct ? "map.wyrmwayPuzzle.correctTarget" : "map.wyrmwayPuzzle.wrongTarget")}</span>
                </div>
              </li>
            ))}
          </ul>
          {profile.evidenceBooks.length > 0 && (
            <>
              <h5 className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">{t("map.wyrmwayPuzzle.evidenceBooks")}</h5>
              <p className="map-dialogue-hint">{profile.evidenceBooks.map(({ bookTitle }) => bookTitle).join(" · ")}</p>
            </>
          )}
        </>
      ) : profile.kind === "justice" ? (
        <>
          <p className="map-dialogue-hint">{t("map.wyrmwayPuzzle.justiceHint")}</p>
          <ul className="map-dialogue-events">
            {profile.paintings.map((painting) => (
              <li key={painting.contentId} className={painting.correct ? "border-emerald-300/25 bg-emerald-300/[0.045]" : undefined}>
                <div className="flex items-center justify-between gap-3">
                  <strong>{painting.title}</strong>
                  <span className="map-dialogue-tag">{t(painting.correct ? "map.wyrmwayPuzzle.correctPainting" : "map.wyrmwayPuzzle.wrongPainting")}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="map-dialogue-hint">{t("map.wyrmwayPuzzle.courageHint")}</p>
          <p className="map-dialogue-hint">{t("map.wyrmwayPuzzle.courageFailure")}</p>
          <div className="mt-3 grid gap-2">
            {couragePhases.map((phase, index) => (
              <div key={phase} className="rounded-[var(--radius-md)] border border-white/8 bg-white/[0.025] px-2.5 py-2">
                <strong className="block text-[11px] text-white">{t("map.wyrmwayPuzzle.courageWave", { number: index + 1 })}</strong>
                <p className="map-dialogue-hint">{profile.enemies.filter((enemy) => enemy.phase === phase).map(({ title }) => title).join(" · ")}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
};

export default MapWyrmwayPuzzleProfileSection;
