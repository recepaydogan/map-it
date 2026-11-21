import { useTranslation } from "react-i18next";
import type { MapInstanceFacts as InstanceFacts } from "./types";

interface MapInstanceFactsProps { facts?: InstanceFacts; }

const MapInstanceFacts = ({ facts }: MapInstanceFactsProps) => {
  const { t } = useTranslation();
  if (!facts || (facts.minimumEntryLevel === undefined && facts.groupSize === undefined
    && facts.betaAvailable === undefined && facts.betaLevelRange === undefined)) {
    return null;
  }
  return <section className="map-instance-facts" aria-label={t("map.instanceFacts.title")}>
    {facts.minimumEntryLevel !== undefined && <div className="map-instance-fact">
      <span>{t("map.instanceFacts.minimumEntryLevel")}</span>
      <strong>{facts.minimumEntryLevel}+</strong>
    </div>}
    {facts.groupSize !== undefined && <div className="map-instance-fact">
      <span>{t("map.instanceFacts.groupSize")}</span>
      <strong>{t("map.instanceFacts.playerCount", { count: facts.groupSize })}</strong>
    </div>}
    {facts.betaAvailable && <div className="map-instance-fact">
      <span>{t("map.instanceFacts.betaAvailable")}</span>
      <strong>{t("reference.yes")}</strong>
    </div>}
    {facts.betaLevelRange && <div className="map-instance-fact">
      <span>{t("map.instanceFacts.betaLevelRange")}</span>
      <strong>{facts.betaLevelRange}</strong>
    </div>}
  </section>;
};

export default MapInstanceFacts;
