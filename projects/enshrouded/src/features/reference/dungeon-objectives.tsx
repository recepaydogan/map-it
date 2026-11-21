import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import type { ReferenceEntry } from "./reference-types";

const DungeonObjectives = ({ guide }: { guide: NonNullable<ReferenceEntry["chestGuide"]> }) => {
  const { t } = useTranslation();
  return <section className="space-y-3">
    <DatabaseSectionTitle>{t("reference.worldObject.dungeonObjectives")}</DatabaseSectionTitle>
    <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-zinc-200 marker:text-subtle">
      {guide.steps.map((step, index) => <li key={`${step.label}-${index}`}>
        {t(step.label)}{step.optional && <span className="ml-1 text-xs text-subtle">{t("reference.worldObject.optionalObjective")}</span>}
      </li>)}
    </ol>
  </section>;
};

export default DungeonObjectives;
