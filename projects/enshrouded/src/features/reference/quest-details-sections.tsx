import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface QuestDetailsSectionsProps {
  showHeading?: boolean;
  requiredLevel?: number;
  questLevel?: number;
  faction?: string;
  requiredClass?: string;
  requiredProfession?: string;
  requiredReputation?: string;
  objective?: ReactNode;
  objectiveSupplement?: ReactNode;
  description?: string;
  progressText?: string;
  completionText?: string;
  startsWith?: ReactNode;
  turnInTo?: ReactNode;
  rewards?: ReactNode;
}

function QuestDetailField({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0">
    <dt className="map-micro-label">{label}</dt>
    <dd className="mt-1 break-words text-[13px] leading-relaxed text-zinc-200">{children}</dd>
  </div>;
}

export default function QuestDetailsSections({ showHeading = true, requiredLevel, questLevel, faction, requiredClass,
  requiredProfession, requiredReputation, objective, objectiveSupplement, description, progressText, completionText,
  startsWith, turnInTo, rewards }: QuestDetailsSectionsProps) {
  const { t } = useTranslation();
  return <section className={showHeading ? "mt-4 border-t border-border pt-4" : undefined}
    aria-label={t("map.foreverQuest.title")}>
    {showHeading && <h3 className="text-[13px] font-semibold text-zinc-100">{t("map.foreverQuest.title")}</h3>}
    {(requiredLevel !== undefined || questLevel !== undefined || faction || requiredClass || requiredProfession || requiredReputation) &&
      <dl className={`${showHeading ? "mt-3 " : ""}grid grid-cols-2 gap-x-4 gap-y-3`}>
        {requiredLevel !== undefined && <QuestDetailField label={t("map.foreverQuest.requiredLevel")}>{requiredLevel}</QuestDetailField>}
        {questLevel !== undefined && <QuestDetailField label={t("map.foreverQuest.questLevel")}>{questLevel}</QuestDetailField>}
        {faction && <QuestDetailField label={t("map.foreverQuest.faction")}>{faction}</QuestDetailField>}
        {requiredClass && <QuestDetailField label={t("map.foreverQuest.requiredClass")}>{requiredClass}</QuestDetailField>}
        {requiredProfession && <QuestDetailField label={t("map.foreverQuest.requiredProfession")}>{requiredProfession}</QuestDetailField>}
        {requiredReputation && <QuestDetailField label={t("map.foreverQuest.requiredReputation")}>{requiredReputation}</QuestDetailField>}
      </dl>}
    {(objective || objectiveSupplement) && <div className="mt-4 border-t border-border pt-4">
      <p className="map-micro-label">{t("map.foreverQuest.objective")}</p>
      {objective && <p className="mt-1 text-[13px] leading-relaxed text-zinc-300">{objective}</p>}
      {objectiveSupplement}
    </div>}
    {[{ text: description, label: t("map.foreverQuest.description") },
      { text: progressText, label: t("map.foreverQuest.progress") },
      { text: completionText, label: t("map.foreverQuest.completion") }]
      .filter((section) => !!section.text)
      .map((section) => <div key={section.label} className="mt-4 border-t border-border pt-4">
        <p className="map-micro-label">{section.label}</p>
        <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-zinc-300">{section.text}</p>
      </div>)}
    {(startsWith || turnInTo) && <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4">
      {startsWith && <QuestDetailField label={t("map.foreverQuest.startsAt")}>{startsWith}</QuestDetailField>}
      {turnInTo && <QuestDetailField label={t("map.foreverQuest.endsAt")}>{turnInTo}</QuestDetailField>}
    </dl>}
    {rewards && <div className="mt-4 border-t border-border pt-4">
      <p className="map-micro-label">{t("dungeonQuest.reward")}</p>
      {rewards}
    </div>}
  </section>;
}
