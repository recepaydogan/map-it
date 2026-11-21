import { useRewardOrder } from "../database/use-reward-order";
import ActivityRewardLinks from "./activity-reward-links";
import { getItemDisplayName } from "../../lib/item-display-name";
import ProgressiveList from "../../components/progressive-list";
import { ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react";
import { useContext, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import DatabaseSectionTitle from "../database/database-section-title";
import ItemIcon from "../database/item-icon";
import ItemGrade from "../database/item-grade";
import { openReference } from "./reference-navigation";
import { ReferenceNavigationContext, sameReferenceTarget, useSelectedReference } from "./reference-navigation-context";
import ReferenceRewardRates from "./reference-reward-rates";
import AdventureLinkList from "./adventure-link-list";
import WorldReferenceCard from "./world-reference-card";
import { cn } from "../../lib/cn";
import type { ReferenceFact, ReferenceLink, ReferenceSection } from "./reference-types";
import { useIntelligenceData } from "./use-reference-data";
import type { SpecialItemDetailsData } from "../intelligence/intelligence-types";

const isTechnicalFact = (label: string) => /(?:table-order|table-units|client-index)$/.test(label);

const FactRows = ({ facts }: { facts: ReferenceFact[] }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  return <dl className="divide-y divide-border/50">{facts.map((fact, index) => <div key={`${fact.label}-${index}`} className="flex justify-between gap-6 py-1.5 text-[13px]">
    <dt className="text-zinc-400">{t(fact.label)}</dt>
    <dd className="max-w-[65%] whitespace-pre-line break-words text-right tabular-nums text-zinc-100">{fact.label === "reference.labels.grade" && typeof fact.value === "string"
      ? <ItemGrade grade={fact.value} />
      : typeof fact.value === "boolean" ? t(fact.value ? "reference.yes" : "reference.no") : typeof fact.value === "number" ? fact.value.toLocaleString(i18n.language) : typeof fact.value === "string" ? gameText(fact.value) : fact.value}</dd>
  </div>)}</dl>;
};

export const ReferenceLinks = ({ links, showRewardRates = false, activityRewardRates = false, cardRewards = false, initialCount, trailing }: { links: ReferenceLink[]; showRewardRates?: boolean; activityRewardRates?: boolean; cardRewards?: boolean; initialCount?: number; trailing?: (link: ReferenceLink) => React.ReactNode }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const onOpenReference = useContext(ReferenceNavigationContext);
  const selectedReference = useSelectedReference();
  const [expanded, setExpanded] = useState<string | null>(null);
  const orderRewards = useRewardOrder();
  const hasRecipes = links.some((link) => link.id.startsWith("ConversionRecipe:"));
  const visibility = useIntelligenceData<SpecialItemDetailsData>("special-item-details", hasRecipes);
  if (hasRecipes && visibility.status === "error") return <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>;
  const hidden = new Set(visibility.status === "ready" ? visibility.data.hiddenRecipes : []);
  const visibleLinks = links.filter((link) => !link.id.startsWith("ConversionRecipe:") || visibility.status === "ready" && !hidden.has(link.id));
  if (activityRewardRates && showRewardRates) return <ActivityRewardLinks links={visibleLinks} initialCount={initialCount} />;
  if (cardRewards) return <AdventureLinkList links={visibleLinks} showRates={showRewardRates} initialCount={initialCount} />;
  return <div className="@container min-w-0 w-full"><ProgressiveList initialCount={initialCount} className={cn("grid gap-1.5", visibleLinks.length > 1 && "@min-[540px]:grid-cols-2")}>{(showRewardRates ? orderRewards(visibleLinks) : visibleLinks).map((link, index) => <div key={`${link.category}-${link.id}-${index}`} className={cn("min-w-0", expanded === link.id && "col-span-full")}><button type="button"
    aria-expanded={!onOpenReference && ["creatures", "exploration"].includes(link.category) ? expanded === link.id : undefined}
    aria-pressed={selectedReference !== undefined ? sameReferenceTarget(selectedReference, link) : undefined}
    onClick={() => {
      if (onOpenReference) onOpenReference(link);
      else if (["creatures", "exploration"].includes(link.category)) setExpanded(expanded === link.id ? null : link.id);
      else openReference(link);
    }} className={cn("group flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-2 text-left text-[12px] transition-colors hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent", sameReferenceTarget(selectedReference, link) ? "border-accent/60 bg-accent-soft" : "border-border bg-white/[0.025]")}>
    {link.icon && <ItemIcon icon={link.icon} name={getItemDisplayName(gameText(link.name))} size={28} />}
    <span className="min-w-0 flex-1"><span className="block font-medium text-zinc-100">{getItemDisplayName(gameText(link.name))}</span>{(link.note || link.noteKey) && !showRewardRates && <span className="block text-[11px] text-subtle">{link.noteKey ? t(link.noteKey) : gameText(link.note!)}</span>}
      {showRewardRates && <ReferenceRewardRates rates={link.rewardRates} activity={activityRewardRates} />}
      {link.skillDetails?.length ? <span className="mt-1 block text-[11px] leading-relaxed text-subtle">{link.skillDetails.map((fact) => `${t(fact.label)}: ${gameText(String(fact.value))}`).join(" · ")}</span> : null}
    </span>
    {link.quantity !== undefined && !(showRewardRates && link.rewardRates?.length) && <span className="text-zinc-400">×{link.quantity.toLocaleString(i18n.language)}</span>}
    {trailing?.(link)}
    {onOpenReference ? <ChevronRight size={13} className="shrink-0 text-accent/60" aria-hidden="true" /> : ["creatures", "exploration"].includes(link.category) ? <ChevronDown size={13} className={cn("shrink-0 text-accent transition-transform", expanded === link.id && "rotate-180")} aria-hidden="true" /> : <ArrowUpRight size={13} className="shrink-0 text-accent/60" aria-hidden="true" />}
  </button>{expanded === link.id && <div className="mt-2 rounded-[var(--radius-sm)] border border-border bg-surface p-3"><WorldReferenceCard id={link.id} /></div>}</div>)}</ProgressiveList></div>;
};

export const ReferenceFacts = ({ facts }: { facts: ReferenceFact[] }) => {
  const readable = facts.filter((fact) => !isTechnicalFact(fact.label));
  return readable.length > 0 ? <FactRows facts={readable} /> : null;
};

const SkillLinks = ({ links }: { links: ReferenceLink[] }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const groups = new Map<string, ReferenceLink[]>();
  for (const link of new Map(links.map((link) => [link.id, link])).values()) {
    const group = groups.get(link.name) ?? [];
    group.push(link);
    groups.set(link.name, group);
  }
  const single = [...groups.values()].filter((group) => group.length === 1).flat();
  return <div className="space-y-3">
    {single.length > 0 && <ReferenceLinks links={single} />}
    <ProgressiveList className="space-y-3">{[...groups].filter(([, group]) => group.length > 1).map(([name, group]) => <details key={name} className="rounded-[var(--radius-md)] border border-border bg-surface px-3 py-3">
      <summary className="cursor-pointer text-[13px] font-medium text-zinc-100">{gameText(name)}<span className="ml-2 text-[11px] font-normal text-subtle">{t("reference.skills.variants", { count: group.length })}</span></summary>
      <div className="mt-3"><ReferenceLinks links={group.map((link, index) => ({ ...link, name: t("reference.skills.variant", { name, number: index + 1 }) }))} /></div>
    </details>)}</ProgressiveList>
  </div>;
};

const Section = ({ section, hideTitle = false, activityRewardRates = false, initialCount, renderText }: { section: ReferenceSection; hideTitle?: boolean; activityRewardRates?: boolean; initialCount?: number; renderText?: (text: string) => ReactNode }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const isUsageRules = ["reference.labels.usage-and-restrictions", "database.usageRules"].includes(section.title);
  const showRates = section.showRewardRates || ["reference.labels.possible-drops", "reference.labels.possible-rewards", "reference.labels.possible-contents", "reference.labels.possible-dismantling-results"].includes(section.title);
  const cardRewards = section.title === "reference.labels.possible-rewards";
  const effect = section.title === "reference.labels.use-effect"
    ? section.facts?.find((fact) => fact.label === "reference.labels.effect" && typeof fact.value === "string")
    : undefined;
  const facts = section.facts?.filter((fact) => fact !== effect);
  const hasEffectDescription = Boolean(effect && (section.summary || section.text));
  const technicalRows = section.rows?.length && section.rows.every((row) =>
    row.facts?.length && row.facts.every((fact) => isTechnicalFact(fact.label)) && !row.description);
  const linkCount = (section.links?.length ?? 0) + (section.rows ?? []).reduce((count, row) => count + (row.links?.length ?? 0), 0);
  const visibleCardCount = linkCount || section.rows?.length || 0;
  const titleCount = showRates || section.title === "reference.labels.guaranteed-drops"
    || section.title === "reference.labels.guaranteed-rewards" || visibleCardCount > 25 ? visibleCardCount : undefined;
  if (!isUsageRules && technicalRows && !section.text && !section.facts?.length && !section.links?.length) {
    return null;
  }
  const content = <section className="space-y-3">
    {effect && !hasEffectDescription ? <div className="space-y-1.5">
      {!hideTitle && <DatabaseSectionTitle className="mb-0">{t(section.title)}</DatabaseSectionTitle>}
      <p className="whitespace-pre-line break-words pl-5 text-[14px] font-medium leading-6 text-zinc-100">{typeof effect.value === "string" ? gameText(effect.value) : effect.value}</p>
    </div> : !hideTitle && !isUsageRules && <DatabaseSectionTitle count={titleCount}>{t(section.title)}</DatabaseSectionTitle>}
    {section.summary ? <p className="text-[14px] font-medium leading-relaxed text-zinc-100">{t(section.summary.key, section.summary.values)}</p>
      : section.text && <p className="whitespace-pre-line text-[13px] leading-relaxed text-zinc-300">{renderText ? renderText(gameText(section.text)) : gameText(section.text)}</p>}
    {section.summaryNotice ? <p className="text-[12px] leading-relaxed text-subtle">{t(section.summaryNotice)}</p>
      : section.text?.includes("…") && <p className="text-[12px] leading-relaxed text-subtle">{t("reference.dynamicValues")}</p>}
    {showRates && !section.text && <p className="text-[11px] leading-relaxed text-subtle">{t(section.title === "reference.labels.guaranteed-drops" ? "reference.loot.guaranteedNotice" : "reference.dungeon.ratesNotice")}</p>}
    {facts && facts.length > 0 && <ReferenceFacts facts={facts} />}
    {hasEffectDescription && section.links?.length ? <details className="text-[12px]">
      <summary className="cursor-pointer font-medium text-subtle">{t("reference.useEffect.details")}</summary>
      <div className="mt-2"><ReferenceLinks links={section.links} /></div>
    </details> : section.links && (section.title === "reference.labels.skills" ? <SkillLinks links={section.links} /> : <ReferenceLinks links={section.links} showRewardRates={showRates} activityRewardRates={activityRewardRates} cardRewards={cardRewards} initialCount={initialCount} />)}
    <ProgressiveList initialCount={initialCount} className="space-y-3">{section.rows?.map((row, index) => <div key={index} className="space-y-2 border-l border-accent/25 py-1 pl-3">
      <h4 className="text-[12px] font-medium text-accent">{getItemDisplayName(gameText(row.name))}</h4>
      {row.description && <p className="whitespace-pre-line text-xs leading-relaxed text-zinc-400">{gameText(row.description)}</p>}
      {row.facts && <ReferenceFacts facts={row.facts} />}
      {row.links && <ReferenceLinks links={row.links} showRewardRates={showRates} activityRewardRates={activityRewardRates} cardRewards={cardRewards} initialCount={initialCount} />}
    </div>)}</ProgressiveList>
  </section>;
  return isUsageRules ? <details className="rounded-[var(--radius-md)] border border-border px-4 py-3">
    <summary className="cursor-pointer text-[13px] font-medium text-zinc-200">{t("database.usageRules")}</summary>
    <div className="mt-4">{content}</div>
  </details> : content;
};

const ReferenceSections = ({ sections, hideTitles = false, activityRewardRates = false, initialCount, renderText }: { sections: ReferenceSection[]; hideTitles?: boolean; activityRewardRates?: boolean; initialCount?: number; renderText?: (text: string) => ReactNode }) => {
  const { t } = useTranslation();
  const hasRecipes = sections.some((section) => [...(section.links ?? []), ...(section.rows ?? []).flatMap((row) => row.links ?? [])]
    .some((link) => link.id.startsWith("ConversionRecipe:")));
  const visibility = useIntelligenceData<SpecialItemDetailsData>("special-item-details", hasRecipes);
  if (hasRecipes && visibility.status === "error") return <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>;
  const hidden = new Set(visibility.status === "ready" ? visibility.data.hiddenRecipes : []);
  const visibleLinks = (links?: ReferenceLink[]) => links?.filter((link) => !link.id.startsWith("ConversionRecipe:")
    || visibility.status === "ready" && !hidden.has(link.id));
  const visibleSections = !hasRecipes ? sections : sections.map((section) => ({
    ...section,
    links: visibleLinks(section.links),
    rows: section.rows?.map((row) => ({ ...row, links: visibleLinks(row.links) }))
      .filter((row) => row.description || row.facts?.length || row.links?.length),
  })).filter((section) => section.summary || section.text || section.summaryNotice || section.facts?.length
    || section.links?.length || section.rows?.length || section.imprintResults?.length);
  return visibleSections.length > 0
    ? <div className="@container space-y-6">{visibleSections.map((section, index) => <Section key={`${section.title}-${index}`} section={section} hideTitle={hideTitles} activityRewardRates={activityRewardRates} initialCount={initialCount} renderText={renderText} />)}</div>
    : null;
};
export default ReferenceSections;
