import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Tooltip from "../../components/tooltip";
import { useGameText } from "../../i18n/game-text";
import type { ReferenceFact, ReferenceSummary } from "../reference/reference-types";
import { skillDamageDescription } from "../reference/skill-damage-description";
import SkillDamageDetails from "../reference/skill-damage-details";
import SkillDescriptionText from "../reference/skill-description-text";
import { useReferenceEntry, useSkillDamage } from "../reference/use-reference-data";

const PreviewFacts = ({ facts }: { facts: ReferenceFact[] }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const readable = facts.filter((fact) => !/table-(?:units|order)$|client-index$|enabled-in-client$/.test(fact.label) && fact.value !== "None");
  return <span className="block space-y-1">{readable.slice(0, 6).map((fact, index) => <span key={`${fact.label}-${index}`} className="flex justify-between gap-3 text-[11px] font-normal">
    <span className="text-zinc-400">{t(fact.label)}</span>
    <span className="text-right text-zinc-100">{typeof fact.value === "number" ? fact.value.toLocaleString(i18n.language) : typeof fact.value === "boolean" ? t(fact.value ? "reference.yes" : "reference.no") : gameText(fact.value)}</span>
  </span>)}</span>;
};

const CharacterReferencePreview = ({ summary, name, children, extra, currentLevel, skillLevel, side }: {
  summary?: ReferenceSummary;
  name: string;
  children: ReactNode;
  extra?: ReactNode;
  currentLevel?: number;
  skillLevel?: number;
  side?: "top" | "bottom" | "left" | "right";
}) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const reference = useReferenceEntry(summary);
  const entry = reference.status === "ready" ? reference.data : null;
  const damageState = useSkillDamage(summary);
  const damage = damageState.status === "ready" ? damageState.data : null;
  const description = damage?.description || entry?.description;
  const sections = entry?.sections.filter((section) => ["reference.labels.equipped-bonuses", "reference.labels.collection-bonuses", "reference.labels.owned-effects"].includes(section.title) && section.facts?.length).slice(0, 2) ?? [];
  const levelBonuses = entry?.sections.find((section) => section.title === "reference.labels.growth-bonuses")?.rows?.find((row) => Number(row.name) === currentLevel)?.facts;
  const preview = <span className="block w-56 text-left">
    <span className="mb-1 block text-[12px] font-semibold text-white">{name}</span>
    {extra && <span className="mb-2 block text-[11px] font-normal text-accent">{extra}</span>}
    {description && <span className="mb-2 block whitespace-pre-line text-[11px] font-normal leading-relaxed text-zinc-300"><SkillDescriptionText text={skillDamageDescription(
      gameText(description), damage, skillLevel ?? 1, i18n.language,
      (base) => t("reference.skillDamage.baseValue", { base }),
    )} /></span>}
    {damage?.spec && <span className="mb-2 block text-[11px] text-subtle">{gameText(damage.spec)}</span>}
    {damage && <SkillDamageDetails damage={damage} level={skillLevel ?? 1} compact />}
    {entry?.facts.length ? <PreviewFacts facts={entry.facts} /> : null}
    {sections.map((section) => <span key={section.title} className="mt-2 block border-t border-border pt-1.5">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-accent">{t(section.title)}</span>
      <PreviewFacts facts={section.facts ?? []} />
    </span>)}
    {levelBonuses?.length ? <span className="mt-2 block border-t border-border pt-1.5"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-accent">{t("characterProfiles.currentLevelBonuses", { level: currentLevel })}</span><PreviewFacts facts={levelBonuses} /></span> : null}
  </span>;
  return <Tooltip label={preview} side={side} wrap fitContent className="w-full">{children}</Tooltip>;
};

export default CharacterReferencePreview;
