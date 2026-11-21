import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuestRequirements } from "./use-quest-requirements";
import { useGameText } from "../../i18n/game-text";

interface QuestDetailsSectionsProps {
  questId?: string;
  showHeading?: boolean;
  requiredLevel?: number;
  questLevel?: number;
  faction?: string;
  requiredClass?: string;
  requiredProfession?: string;
  requiredReputation?: string;
  objective?: ReactNode;
  objectiveSupplement?: ReactNode;
  updateNote?: string;
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

export default function QuestDetailsSections({ questId, showHeading = true, requiredLevel, questLevel, faction, requiredClass,
  requiredProfession, requiredReputation, objective, objectiveSupplement, updateNote, description, progressText, completionText,
  startsWith, turnInTo, rewards }: QuestDetailsSectionsProps) {
  const { t } = useTranslation();
  const gameText = useGameText();
  const { requirements, error } = useQuestRequirements(questId);
  const classes = requirements?.classes?.map((entry) => gameText(entry.name)).join(", ") ?? requiredClass;
  const profession = requirements?.profession?.name ? gameText(requirements.profession.name) : requiredProfession;
  const classicProfession = !requirements?.profession && requirements?.classicProfessionReference?.name
    ? gameText(requirements.classicProfessionReference.name) : undefined;
  const races = requirements?.races?.map((entry) => gameText(entry.name)).join(", ");
  const skillObjective = requirements?.skillObjective;
  const learnProfession = requirements?.learnProfession;
  return <section className={showHeading ? "@container mt-4 border-t border-border pt-4" : "@container"}
    aria-label={t("map.foreverQuest.title")}>
    {showHeading && <h3 className="text-[13px] font-semibold text-zinc-100">{t("map.foreverQuest.title")}</h3>}
    {(requiredLevel !== undefined || questLevel !== undefined || faction || classes || profession || classicProfession || races || skillObjective || learnProfession || requiredReputation) &&
      <dl className={`${showHeading ? "mt-3 " : ""}grid gap-x-4 gap-y-3 @min-[360px]:grid-cols-2`}>
        {requiredLevel !== undefined && <QuestDetailField label={t("map.foreverQuest.requiredLevel")}>{requiredLevel}</QuestDetailField>}
        {questLevel !== undefined && <QuestDetailField label={t("map.foreverQuest.questLevel")}>{questLevel}</QuestDetailField>}
        {faction && <QuestDetailField label={t("map.foreverQuest.faction")}>{faction}</QuestDetailField>}
        {classes && <QuestDetailField label={t("map.foreverQuest.requiredClass")}>{classes}</QuestDetailField>}
        {classicProfession ? <QuestDetailField label={t("map.foreverQuest.profession")}>
          {classicProfession}<span className="block text-xs text-subtle">{t("map.foreverQuest.foreverVerificationPending")}</span>
        </QuestDetailField> : profession && <QuestDetailField label={t(requirements?.profession ? "map.foreverQuest.profession" : "map.foreverQuest.requiredProfession")}>{profession}</QuestDetailField>}
        {races && <QuestDetailField label={t("map.foreverQuest.requiredRaces")}>{races}</QuestDetailField>}
        {skillObjective && <QuestDetailField label={t("map.foreverQuest.skillObjective")}>
          {t("map.foreverQuest.raiseProfessionSkill", { profession, level: skillObjective.level })}
        </QuestDetailField>}
        {learnProfession && <QuestDetailField label={t("map.foreverQuest.skillObjective")}>
          {t("map.foreverQuest.learnProfession", { profession: gameText(learnProfession.name) })}
        </QuestDetailField>}
        {requiredReputation && <QuestDetailField label={t("map.foreverQuest.requiredReputation")}>{requiredReputation}</QuestDetailField>}
      </dl>}
    {error && <p role="status" className="mt-3 text-xs text-subtle">{t("map.foreverQuest.requirementsUnavailable")}</p>}
    {!!requirements?.prerequisiteQuests?.length && <dl className="mt-3">
      <QuestDetailField label={t("map.foreverQuest.requiredQuestChain")}>
        <ol className="list-inside list-decimal space-y-1">
          {requirements.prerequisiteQuests.map((quest) => <li key={quest.id}>
            {gameText(quest.name, `Quest:${quest.id}:0`)}
          </li>)}
        </ol>
      </QuestDetailField>
    </dl>}
    {!!requirements?.providedItems?.length && <dl className="mt-3">
      <QuestDetailField label={t("map.foreverQuest.providedOnAccept")}>
        {requirements.providedItems.map((item) => <span className="block" key={item.id}>
          {gameText(item.name, `ItemSparse:${item.id}:4`)} ×{item.quantity}
        </span>)}
      </QuestDetailField>
    </dl>}
    {(objective || objectiveSupplement) && <div className="mt-4 border-t border-border pt-4">
      <p className="map-micro-label">{t("map.foreverQuest.objective")}</p>
      {objective && <p className="mt-1 text-[13px] leading-relaxed text-zinc-300">{objective}</p>}
      {objectiveSupplement}
    </div>}
    {updateNote && <p className="mt-4 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-3 py-2 text-[12px] leading-5 text-zinc-300">{updateNote}</p>}
    {[{ text: description, label: t("map.foreverQuest.description") },
      { text: progressText, label: t("map.foreverQuest.progress") },
      { text: completionText, label: t("map.foreverQuest.completion") }]
      .filter((section) => !!section.text)
      .map((section) => <div key={section.label} className="mt-4 border-t border-border pt-4">
        <p className="map-micro-label">{section.label}</p>
        <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-zinc-300">{section.text}</p>
      </div>)}
    {(startsWith || turnInTo) && <dl className="mt-4 grid gap-x-4 gap-y-3 border-t border-border pt-4 @min-[360px]:grid-cols-2">
      {startsWith && <QuestDetailField label={t("map.foreverQuest.startsAt")}>{startsWith}</QuestDetailField>}
      {turnInTo && <QuestDetailField label={t("map.foreverQuest.endsAt")}>{turnInTo}</QuestDetailField>}
    </dl>}
    {rewards && <div className="mt-4 border-t border-border pt-4">
      <p className="map-micro-label">{t("dungeonQuest.reward")}</p>
      {rewards}
    </div>}
  </section>;
}
