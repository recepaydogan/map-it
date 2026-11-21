import { PanelsTopLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapSecretPuzzleProfile } from "./types";

const MapSecretPuzzleProfileSection = ({ profile }: { profile: MapSecretPuzzleProfile }) => {
  const { t } = useTranslation();

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-secret-puzzle-title">
      <div className="map-dialogue-section-heading">
        <PanelsTopLeft size={14} aria-hidden="true" />
        <h4 id="map-secret-puzzle-title">{profile.title}</h4>
      </div>
      <p className="map-dialogue-hint">{t(`map.secretPuzzle.roleHints.${profile.role}`)}</p>
      <ol className="mt-3 grid gap-2">
        <li className="rounded-[var(--radius-md)] border border-white/8 bg-white/[0.025] px-2.5 py-2">
          <strong className="block text-[11px] text-white">{t("map.secretPuzzle.steps.moveStones")}</strong>
          <span className="mt-1 block text-[10px] leading-relaxed text-white/55">{profile.stones.map(({ title }) => title).join(" · ")}</span>
        </li>
        <li className="rounded-[var(--radius-md)] border border-white/8 bg-white/[0.025] px-2.5 py-2">
          <strong className="block text-[11px] text-white">{t("map.secretPuzzle.steps.pressButtons", { count: profile.requiredButtonCount })}</strong>
          <span className="mt-1 block text-[10px] leading-relaxed text-white/55">{profile.buttons.map(({ title }) => title).join(" · ")}</span>
        </li>
        <li className="rounded-[var(--radius-md)] border border-cyan-200/20 bg-cyan-200/[0.045] px-2.5 py-2">
          <strong className="block text-[11px] text-white">{t("map.secretPuzzle.steps.openWall")}</strong>
          <span className="mt-1 block text-[10px] leading-relaxed text-cyan-100/60">{profile.target.title}</span>
        </li>
      </ol>
    </section>
  );
};

export default MapSecretPuzzleProfileSection;
