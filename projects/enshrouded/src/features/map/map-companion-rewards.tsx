import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import { ReferenceLinks } from "../reference/reference-sections";
import type { MapCompanionSource } from "./map-companion-sources";

export default function MapCompanionRewards({ sources }: { sources: MapCompanionSource[] }) {
  const { t } = useTranslation();
  if (!sources.length) return null;
  return <section className="@container mt-4 space-y-3">
    <DatabaseSectionTitle>{t("map.categories.petSouls")}</DatabaseSectionTitle>
    <ReferenceLinks links={sources.map(({ soul }) => soul)} />
  </section>;
}
