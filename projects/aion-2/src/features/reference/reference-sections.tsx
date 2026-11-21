import { useRewardOrder } from "../database/use-reward-order";
import ActivityRewardLinks from "./activity-reward-links";
import { getItemDisplayName } from "../../lib/item-display-name";
import ProgressiveList from "../../components/progressive-list";
import { ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react";
import { useContext, useState } from "react";
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
import { factionDisplayName } from "../../lib/faction-display-name";
import { requestMapPointInMain } from "../map/map-window-bridge";
import { GUIDE_NAVIGATION_ZOOM } from "../map/map-focus-request";
import { ReferenceLocationContext } from "./reference-location-context";
import ReferenceLocations from "./reference-locations";
import ReferenceTierCards from "./reference-tier-cards";
import { REFERENCE_FACT_VALUE_DIVISORS } from "../../game-config";
import type { ReferenceFact, ReferenceLink, ReferenceSection } from "./reference-types";
import { useIntelligenceData } from "./use-reference-data";
import type { SpecialItemDetailsData } from "../intelligence/intelligence-types";
import { useReferenceLinkDisplayName } from "./use-reference-link-display-name";

const isTechnicalFact = (label: string) => /(?:table-order|table-units|client-index)$/.test(label);

const FactRows = ({ facts, compact = false }: { facts: ReferenceFact[]; compact?: boolean }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  return <dl className="divide-y divide-border/50">{facts.map((fact, index) => <div key={`${fact.label}-${index}`} className={cn(
    "flex justify-between gap-6 py-1.5 text-[13px]", compact && "w-fit justify-start gap-2",
  )}>
    <dt className="text-zinc-400">{t(fact.label)}</dt>
    <dd className="max-w-[65%] whitespace-pre-line break-words text-right tabular-nums text-zinc-100">{fact.label === "reference.labels.grade" && typeof fact.value === "string"
      ? <ItemGrade grade={fact.value} />
      : typeof fact.value === "boolean" ? t(fact.value ? "reference.yes" : "reference.no") : typeof fact.value === "number" ? (fact.value / (REFERENCE_FACT_VALUE_DIVISORS[fact.label] ?? 1)).toLocaleString(i18n.language) : typeof fact.value === "string" ? fact.label === "reference.labels.faction" ? factionDisplayName(fact.value, t, gameText) : gameText(fact.value) : fact.value}</dd>
  </div>)}</dl>;
};

export const ReferenceLinks = ({ links, showRewardRates = false, activityRewardRates = false, cardRewards = false, directNavigation = false, compact = false, initialCount, trailing }: { links: ReferenceLink[]; showRewardRates?: boolean; activityRewardRates?: boolean; cardRewards?: boolean; directNavigation?: boolean; compact?: boolean; initialCount?: number; trailing?: (link: ReferenceLink) => React.ReactNode }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const onOpenReference = useContext(ReferenceNavigationContext);
  const selectedReference = useSelectedReference();
  const [expanded, setExpanded] = useState<string | null>(null);
  const orderRewards = useRewardOrder();
  const hasRecipes = links.some((link) => link.id.startsWith("ConversionRecipe:"));
  const displayLinkName = useReferenceLinkDisplayName(links);
  const visibility = useIntelligenceData<SpecialItemDetailsData>("special-item-details", hasRecipes);
  if (hasRecipes && visibility.status === "error") return <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>;
  const hidden = new Set(visibility.status === "ready" ? visibility.data.hiddenRecipes : []);
  const visibleLinks = links.filter((link) => !link.id.startsWith("ConversionRecipe:") || visibility.status === "ready" && !hidden.has(link.id));
  if (activityRewardRates && showRewardRates) return <ActivityRewardLinks links={visibleLinks} initialCount={initialCount} />;
  if (cardRewards) return <AdventureLinkList links={visibleLinks} showRates={showRewardRates} initialCount={initialCount} />;
  return <div className="@container min-w-0 w-full"><ProgressiveList initialCount={initialCount} className={cn(compact ? "flex flex-wrap justify-start gap-1.5" : "grid gap-1.5 @min-[540px]:grid-cols-2")}>{(showRewardRates ? orderRewards(visibleLinks) : visibleLinks).map((link, index) => <div key={`${link.category}-${link.id}-${index}`} className={cn("min-w-0", compact && "w-full @min-[540px]:w-[calc(50%-3px)]", expanded === link.id && (compact ? "@min-[540px]:w-full" : "col-span-full"))}><button type="button"
    aria-expanded={!directNavigation && !onOpenReference && ["creatures", "exploration"].includes(link.category) ? expanded === link.id : undefined}
    aria-pressed={selectedReference !== undefined ? sameReferenceTarget(selectedReference, link) : undefined}
    onClick={() => {
      if (directNavigation) openReference(link);
      else if (onOpenReference) onOpenReference(link);
      else if (["creatures", "exploration"].includes(link.category)) setExpanded(expanded === link.id ? null : link.id);
      else openReference(link);
    }} className={cn("group flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-2 text-left text-[12px] transition-colors hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent", sameReferenceTarget(selectedReference, link) ? "border-accent/60 bg-accent-soft" : "border-border bg-white/[0.025]")}>
    {link.icon && <ItemIcon icon={link.icon} name={displayLinkName(link)} size={28} />}
    <span className="min-w-0 flex-1"><span className="block font-medium text-zinc-100">{displayLinkName(link)}</span>{link.note && !showRewardRates && <span className="block text-[11px] text-subtle">{gameText(link.note)}</span>}
      {showRewardRates && <ReferenceRewardRates rates={link.rewardRates} activity={activityRewardRates} />}
      {link.skillDetails?.length ? <span className="mt-1 block text-[11px] leading-relaxed text-subtle">{link.skillDetails.map((fact) => `${t(fact.label)}: ${gameText(String(fact.value))}`).join(" · ")}</span> : null}
    </span>
    {link.quantity !== undefined && !(showRewardRates && link.rewardRates?.length) && <span className="text-zinc-400">×{link.quantity.toLocaleString(i18n.language)}</span>}
    {trailing?.(link)}
    {directNavigation ? <ArrowUpRight size={13} className="shrink-0 text-accent/60" aria-hidden="true" /> : onOpenReference ? <ChevronRight size={13} className="shrink-0 text-accent/60" aria-hidden="true" /> : ["creatures", "exploration"].includes(link.category) ? <ChevronDown size={13} className={cn("shrink-0 text-accent transition-transform", expanded === link.id && "rotate-180")} aria-hidden="true" /> : <ArrowUpRight size={13} className="shrink-0 text-accent/60" aria-hidden="true" />}
  </button>{!directNavigation && expanded === link.id && <div className="mt-2 rounded-[var(--radius-sm)] border border-border bg-surface p-3"><WorldReferenceCard id={link.id} /></div>}</div>)}</ProgressiveList></div>;
};

export const ReferenceFacts = ({ facts, compact = false }: { facts: ReferenceFact[]; compact?: boolean }) => {
  const readable = facts.filter((fact) => !isTechnicalFact(fact.label));
  return readable.length > 0 ? <FactRows facts={readable} compact={compact} /> : null;
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
      <div className="mt-3"><ReferenceLinks links={group.map((link, index) => ({ ...link, name: t("reference.skills.variant", { name: gameText(name), number: index + 1 }) }))} /></div>
    </details>)}</ProgressiveList>
  </div>;
};

const Section = ({ section, hideTitle = false, activityRewardRates = false, compactLinks = false, initialCount }: { section: ReferenceSection; hideTitle?: boolean; activityRewardRates?: boolean; compactLinks?: boolean; initialCount?: number }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const currentMarker = useContext(ReferenceLocationContext);
  const showRates = section.showRewardRates || ["reference.labels.possible-drops", "reference.labels.possible-rewards", "reference.labels.possible-contents", "reference.labels.possible-dismantling-results"].includes(section.title);
  const cardRewards = section.title === "reference.labels.possible-rewards";
  const technicalRows = section.rows?.length && section.rows.every((row) =>
    row.facts?.length && row.facts.every((fact) => isTechnicalFact(fact.label)) && !row.description);
  const linkCount = (section.links?.length ?? 0) + (section.rows ?? []).reduce((count, row) => count + (row.links?.length ?? 0), 0);
  const visibleCardCount = linkCount || section.rows?.length || 0;
  const titleCount = showRates || section.title === "reference.labels.guaranteed-drops"
    || section.title === "reference.labels.guaranteed-rewards" || visibleCardCount > 25 ? visibleCardCount : undefined;
  if (technicalRows && !section.text && !section.facts?.length && !section.links?.length) {
    return null;
  }
  const content = <section className="space-y-3">
    {!hideTitle && <DatabaseSectionTitle count={titleCount}>{t(section.title)}</DatabaseSectionTitle>}
    {section.summary ? <p className="text-[14px] font-medium leading-relaxed text-zinc-100">{t(section.summary.key, section.summary.values)}</p>
      : section.text && <p className="whitespace-pre-line text-[13px] leading-relaxed text-zinc-300">{gameText(section.text)}</p>}
    {section.summaryNotice ? <p className="text-[12px] leading-relaxed text-subtle">{t(section.summaryNotice)}</p>
      : section.text?.includes("…") && <p className="text-[12px] leading-relaxed text-subtle">{t("reference.dynamicValues")}</p>}
    {showRates && !section.text && <p className="text-[11px] leading-relaxed text-subtle">{t(section.title === "reference.labels.guaranteed-drops" ? "reference.loot.guaranteedNotice" : "reference.dungeon.ratesNotice")}</p>}
    {section.facts && section.facts.length > 0 && <ReferenceFacts facts={section.facts} />}
    {section.links && (section.title === "reference.labels.skills" ? <SkillLinks links={section.links} /> : <ReferenceLinks links={section.links} showRewardRates={showRates} activityRewardRates={activityRewardRates} cardRewards={cardRewards} compact={compactLinks} initialCount={initialCount} />)}
    {section.tierCards && <ReferenceTierCards cards={section.tierCards} />}
    <ProgressiveList initialCount={initialCount} className="space-y-3">{section.rows?.map((row, index) => <div key={index} className="space-y-2 border-l border-accent/25 py-1 pl-3">
      <h4 className="text-[12px] font-medium text-accent">{getItemDisplayName(row.name, gameText(row.name))}</h4>
      {row.description && <p className="whitespace-pre-line text-xs leading-relaxed text-zinc-400">{gameText(row.description)}</p>}
      {row.facts && <ReferenceFacts facts={row.facts} />}
      {row.links && <ReferenceLinks links={row.links} showRewardRates={showRates} activityRewardRates={activityRewardRates} cardRewards={cardRewards} compact={compactLinks} initialCount={initialCount} />}
      {row.location && <ReferenceLocations locations={[row.location]} embedded iconPath={row.locationIcon} onOpenMap={(mapId, markerId) => requestMapPointInMain(markerId, mapId, undefined, !!currentMarker, currentMarker ? undefined : GUIDE_NAVIGATION_ZOOM)} />}
    </div>)}</ProgressiveList>
  </section>;
  return content;
};

const ReferenceSections = ({ sections, hideTitles = false, activityRewardRates = false, compactLinks = false, initialCount }: { sections: ReferenceSection[]; hideTitles?: boolean; activityRewardRates?: boolean; compactLinks?: boolean; initialCount?: number }) => {
  const { t } = useTranslation();
  const displaySections = sections.filter((section) => section.title !== "reference.labels.use-effect");
  const hasRecipes = displaySections.some((section) => [...(section.links ?? []), ...(section.rows ?? []).flatMap((row) => row.links ?? [])]
    .some((link) => link.id.startsWith("ConversionRecipe:")));
  const visibility = useIntelligenceData<SpecialItemDetailsData>("special-item-details", hasRecipes);
  if (hasRecipes && visibility.status === "error") return <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>;
  const hidden = new Set(visibility.status === "ready" ? visibility.data.hiddenRecipes : []);
  const visibleLinks = (links?: ReferenceLink[]) => links?.filter((link) => !link.id.startsWith("ConversionRecipe:")
    || visibility.status === "ready" && !hidden.has(link.id));
  const visibleSections = !hasRecipes ? displaySections : displaySections.map((section) => ({
    ...section,
    links: visibleLinks(section.links),
    rows: section.rows?.map((row) => ({ ...row, links: visibleLinks(row.links) }))
      .filter((row) => row.description || row.facts?.length || row.links?.length),
  })).filter((section) => section.summary || section.text || section.summaryNotice || section.facts?.length
    || section.links?.length || section.rows?.length || section.tierCards?.tiers.length || section.imprintResults?.length);
  return visibleSections.length > 0
    ? <div className="@container space-y-6">{visibleSections.map((section, index) => <Section key={`${section.title}-${index}`} section={section} hideTitle={hideTitles} activityRewardRates={activityRewardRates} compactLinks={compactLinks} initialCount={initialCount} />)}</div>
    : null;
};
export default ReferenceSections;
