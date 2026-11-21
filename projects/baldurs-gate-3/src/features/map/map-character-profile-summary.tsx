import { ArrowRight } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { isMapCharacterVulnerability } from "./map-character-combat-utils";
import { MapCombatTypeChip, MapCombatTypeList } from "./map-combat-type";
import MapDetailSection from "./map-detail-section";
import type { MapCharacterCombatProfile } from "./types";

interface MapCharacterProfileSummaryProps {
  profile: MapCharacterCombatProfile;
  onOpen: () => void;
}

/** Compact encounter summary; the complete stat block lives in its own panel view. */
const MapCharacterProfileSummary = ({ profile, onOpen }: MapCharacterProfileSummaryProps) => {
  const { t } = useTranslation();
  const resistances = profile.resistances ?? [];
  const vulnerabilities = resistances.filter(isMapCharacterVulnerability);
  const avoid = resistances.filter((resistance) => !isMapCharacterVulnerability(resistance));
  const vulnerabilityTypes = vulnerabilities.map(({ type }) => type);
  const avoidTypes = avoid.map(({ type }) => type);
  const chips = [
    ...vulnerabilityTypes.slice(0, 2).map((type) => ({ type, direction: "up" as const })),
    ...avoidTypes.slice(0, vulnerabilityTypes.length > 0 ? 1 : 2)
      .map((type) => ({ type, direction: "down" as const })),
  ];

  return (
    <MapDetailSection id="map-character-profile-summary-heading" title={t("map.character.intelTitle")}>
      <div className="space-y-3">
        <p className="text-[13px] leading-relaxed text-zinc-300">
          {vulnerabilityTypes.length > 0 ? (
            <Trans
              i18nKey="map.character.summaryWeakness"
              components={{ types: <MapCombatTypeList types={vulnerabilityTypes} /> }}
            />
          ) : avoidTypes.length > 0 ? (
            t("map.character.summaryNoWeakness")
          ) : (
            t("map.character.summaryBaseline", {
              vitality: profile.vitality ?? "—",
              armor: profile.baseArmor ?? "—",
            })
          )}
          {avoidTypes.length > 0 && (
            <>
              {" "}
              <Trans
                i18nKey="map.character.summaryAvoid"
                components={{ types: <MapCombatTypeList types={avoidTypes.slice(0, 3)} /> }}
              />
            </>
          )}
        </p>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map(({ type, direction }) => (
              <MapCombatTypeChip key={`${direction}:${type}`} type={type} direction={direction} />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onOpen}
          className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-2 text-[12px] font-medium transition-colors cursor-pointer border-border bg-white/[0.03] text-zinc-300 hover:border-accent/50 hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t("map.character.openProfile")}
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>
    </MapDetailSection>
  );
};

export default MapCharacterProfileSummary;
