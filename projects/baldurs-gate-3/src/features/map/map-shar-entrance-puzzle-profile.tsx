import { useTranslation } from "react-i18next";
import MapDetailSection from "./map-detail-section";
import type { MapSharEntrancePuzzleProfile } from "./types";

const MapSharEntrancePuzzleProfileSection = ({ profile }: { profile: MapSharEntrancePuzzleProfile }) => {
  const { t } = useTranslation();

  return (
    <MapDetailSection id="map-shar-entrance-title" title={profile.title}>
      <ol className="list-decimal space-y-1.5 pl-4 text-[13px] leading-relaxed text-zinc-300">
        <li>{t("map.sharEntrancePuzzle.stepLights", { braziers: profile.braziers, corners: profile.corners })}</li>
        <li>{t("map.sharEntrancePuzzle.stepRings", { detectors: profile.lightDetectors, rings: profile.barrierRings })}</li>
        <li>{t("map.sharEntrancePuzzle.stepCenter")}</li>
      </ol>
      <p className="mt-2.5 text-[11px] leading-relaxed text-muted">{t("map.sharEntrancePuzzle.hazard")}</p>
      <ul className="mt-2.5 flex flex-col gap-1.5">
        {profile.results.map((result) => (
          <li key={result.contentId} className="rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2.5 py-2">
            <strong className="text-[12px] font-semibold text-zinc-100">{result.title}</strong>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{t(result.effect === "removes-arcane-lock" ? "map.sharEntrancePuzzle.removesLock" : "map.sharEntrancePuzzle.opensDoor")}</p>
          </li>
        ))}
      </ul>
    </MapDetailSection>
  );
};

export default MapSharEntrancePuzzleProfileSection;
