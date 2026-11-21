import { useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { useGameText } from "../../i18n/game-text";
import DatabaseSectionTitle from "../database/database-section-title";
import ReferenceBoard from "./reference-board";
import ReferenceLocations from "./reference-locations";
import { ReferenceFacts } from "./reference-sections";
import type { ReferenceEntry } from "./reference-types";
import { skillDamageDescription } from "./skill-damage-description";
import SkillDamageDetails from "./skill-damage-details";
import SkillDescriptionText from "./skill-description-text";
import { useSkillDamage } from "./use-reference-data";

export const REFERENCE_FIRST_COLUMN_CLASS = "w-full @min-[540px]:w-[calc(50%-3px)]";

const ReferenceOverview = ({ entry, onOpenMap, detailsClassName }: {
  entry: ReferenceEntry;
  onOpenMap: (mapId: string, markerId: string) => void;
  detailsClassName?: string;
}) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const [selectedSkillLevel, setSelectedSkillLevel] = useState(1);
  const damageState = useSkillDamage(entry);
  const damage = damageState.status === "ready" ? damageState.data : null;
  const levels = [...new Set([...(damage?.effects ?? []), ...(damage?.healing ?? [])]
    .flatMap((effect) => effect.levels.map((row) => row[0])))].sort((a, b) => a - b);
  const skillLevel = levels.includes(selectedSkillLevel) ? selectedSkillLevel : 1;
  const description = damage?.description || entry.description;
  const renderedDescription = description ? skillDamageDescription(
    gameText(description), damage, skillLevel, i18n.language,
    (base) => t("reference.skillDamage.baseValue", { base }),
  ) : "";
  const facts = entry.category === "collections" && entry.id.startsWith("PeriodItemCollectionList:") && entry.sections.some(section => section.title === "reference.labels.required-items" && section.links?.length)
    ? entry.facts.filter(fact => fact.label !== "reference.labels.required-count")
    : entry.facts;
  return <>
    {renderedDescription && <blockquote className="whitespace-pre-line border-l-2 border-accent/30 pl-4 text-[13px] leading-relaxed text-zinc-300"><SkillDescriptionText text={renderedDescription} /></blockquote>}
    {damage?.spec && <p className="text-[12px] text-subtle">{gameText(damage.spec)}</p>}
    {renderedDescription.includes("…") && <p className="text-[11px] text-muted">{t("reference.dynamicValues")}</p>}
    {damage && <section className="max-w-sm space-y-2">
      {levels.length > 1 && <div className="flex items-center gap-2 text-[12px] text-zinc-300"><span>{t("reference.skillDamage.level")}</span>
        <div className="w-24"><CategoryDropdown ariaLabel={t("reference.skillDamage.level")} value={String(skillLevel)} onChange={(value) => setSelectedSkillLevel(Number(value))}
          options={levels.map((level) => ({ key: String(level), label: level.toLocaleString(i18n.language) }))} triggerClassName="min-h-8 py-1" /></div>
      </div>}
      <SkillDamageDetails damage={damage} level={skillLevel} />
    </section>}
    {facts.length > 0 && <section className={detailsClassName}><DatabaseSectionTitle>{t("reference.detailsTab")}</DatabaseSectionTitle><ReferenceFacts facts={facts} /></section>}
    {entry.board && <ReferenceBoard nodes={entry.board} />}
    {entry.locations.length > 0 && <ReferenceLocations locations={entry.locations} onOpenMap={onOpenMap} />}
  </>;
};

export default ReferenceOverview;
