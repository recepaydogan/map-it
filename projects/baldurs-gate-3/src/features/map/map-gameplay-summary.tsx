import { useTranslation } from "react-i18next";
import MapDetailSection from "./map-detail-section";
import type { MapGameplayMetadata } from "./types";

const MapGameplaySummary = ({ gameplay }: { gameplay: MapGameplayMetadata }) => {
  const { t } = useTranslation();
  if (gameplay.type === "Character") return null;
  const facts = [
    gameplay.rarity && { label: t("map.gameplay.rarity"), value: gameplay.rarity },
    gameplay.slot && { label: t("map.gameplay.slot"), value: gameplay.slot },
    gameplay.armorClass && { label: t("map.gameplay.armorClass"), value: gameplay.armorClass },
    gameplay.armorType && { label: t("map.gameplay.armorType"), value: gameplay.armorType },
    gameplay.weaponType && { label: t("map.gameplay.weaponType"), value: gameplay.weaponType },
    gameplay.damage && { label: t("map.gameplay.damage"), value: [gameplay.damage, gameplay.damageType].filter(Boolean).join(" ") },
    gameplay.proficiency && { label: t("map.gameplay.proficiency"), value: gameplay.proficiency },
    gameplay.unique && { label: t("map.gameplay.quality"), value: t("map.gameplay.unique") },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));
  if (facts.length === 0) return null;

  return (
    <MapDetailSection id="map-gameplay-heading" title={t("map.gameplay.title")}>
      <dl className="grid grid-cols-2 gap-1.5">
        {facts.map((fact) => (
          <div key={`${fact.label}:${fact.value}`} className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-white/[0.03] px-2.5 py-1.5">
            <dt className="text-[12px] text-muted">{fact.label}</dt>
            <dd className="truncate text-[12px] font-semibold tabular-nums text-zinc-100">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </MapDetailSection>
  );
};

export default MapGameplaySummary;
