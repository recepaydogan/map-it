import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import { ReferenceFacts } from "./reference-sections";
import { travelValueKey } from "./travel-presentation";
import type { ReferenceEntry } from "./reference-types";

const TravelPortalAccess = ({ entry }: { entry: ReferenceEntry }) => {
  const { t } = useTranslation();
  const facts = entry.facts.filter((fact) => fact.value !== 0 && fact.value !== false && fact.value !== "None")
    .map((fact) => ({ ...fact, value: typeof fact.value === "string" ? t(travelValueKey(fact.value) ?? fact.value) : fact.value }));

  return <section className="space-y-2 border-t border-border pt-4">
    <DatabaseSectionTitle>{t("reference.travel.requirements")}</DatabaseSectionTitle>
    <ReferenceFacts facts={facts} />
  </section>;
};

export default TravelPortalAccess;
