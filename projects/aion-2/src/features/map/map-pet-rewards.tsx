import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import { ReferenceLinks } from "../reference/reference-sections";
import type { MapPetSource } from "./map-pet-sources";

export default function MapPetRewards({ sources }: { sources: MapPetSource[] }) {
  const { t } = useTranslation();
  if (!sources.length) return null;
  return <section className="@container mt-4 space-y-3">
    <DatabaseSectionTitle>{t("map.categoryGroups.pets")}</DatabaseSectionTitle>
    <ReferenceLinks links={sources} />
  </section>;
}
