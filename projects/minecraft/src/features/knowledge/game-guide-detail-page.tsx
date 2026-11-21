import { ChevronDown, ChevronLeft, MapPinned } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import InspectorHeroImage from "../inspector/inspector-hero-image";
import InspectorLinkRow from "../inspector/inspector-link-row";
import InspectorSubjectIcon from "../inspector/inspector-subject-icon";
import type { InspectorContent, InspectorFact, InspectorGuideSection, InspectorPillSection, InspectorSection } from "../inspector/inspector-types";
import { GuideNavigationContext } from "./guide-navigation-context.ts";

const SECTION_PREVIEW_SIZE = 4;

interface GameGuideDetailPageProps {
  content: InspectorContent;
  onNavigate: (subject: Parameters<typeof InspectorLinkRow>[0]["link"]["subject"]) => void;
  onSearchStructureMap?: (knowledgeId: string) => void;
  backLabel?: string;
  onBack?: () => void;
  focusHeading: boolean;
}

const SectionTitle = ({ children, level = "h3" }: { children: React.ReactNode; level?: "h3" | "h4" }) => {
  const Heading = level;
  return <Heading className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">
    <span className="h-px w-3 bg-accent/70" aria-hidden="true" />{children}
  </Heading>;
};

const SectionLinks = ({ section, onNavigate, onSearchStructureMap, interactive, headingLevel }: {
  section: InspectorSection;
  onNavigate: GameGuideDetailPageProps["onNavigate"];
  onSearchStructureMap?: GameGuideDetailPageProps["onSearchStructureMap"];
  interactive: boolean;
  headingLevel: "h3" | "h4";
}) => {
  const { t } = useTranslation(), [open, setOpen] = useState(!section.collapsed), [showAll, setShowAll] = useState(false);
  const previewSize = Math.min(section.previewSize ?? SECTION_PREVIEW_SIZE, SECTION_PREVIEW_SIZE);
  const links = showAll ? section.links : section.links.slice(0, previewSize);
  const hiddenCount = section.links.length - links.length;
  const compact = !interactive && /^(mechanics:(feeding|breeding)|mob-profile:breeding)(:|$)/.test(section.key);
  const inline = section.key === "ingredients" || section.key === "stations"
    || section.key === "crafting:ingredients" || section.key === "crafting:stations";
  const rows = <div className={compact ? "grid grid-cols-2 gap-x-5 gap-y-1" : inline ? "flex flex-wrap gap-2" : "flex flex-col gap-1.5"}>
    {links.map(link => compact ? <div key={link.key} className="flex min-w-0 items-center gap-2 border-b border-border/60 py-1.5">
      <span className="shrink-0"><InspectorSubjectIcon image={link.image} size={22} /></span>
      <span className="min-w-0 truncate text-[12px] font-medium text-zinc-100">{link.name}</span>
      {link.quantity !== undefined && link.quantity !== 1 && <span className="shrink-0 text-[11px] text-muted">×{link.quantity}</span>}
    </div> : onSearchStructureMap && link.subject.kind === "poi"
      && (section.key === "entity:locations" || section.key === "entity:entry-locations")
      ? <div key={link.key} className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1"><InspectorLinkRow link={link} selected={false}
          onSelect={interactive ? () => onNavigate(link.subject) : undefined} /></div>
        <button type="button" onClick={() => onSearchStructureMap(link.subject.id)}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border border-accent/35 bg-accent-soft px-2.5 py-2 text-[11px] font-semibold text-accent hover:border-accent/70 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
          <MapPinned size={13} aria-hidden="true" />{t("structureMap.search.label")}
        </button>
      </div>
      : <InspectorLinkRow key={link.key} link={link} selected={false} inline={inline}
        onSelect={interactive ? () => onNavigate(link.subject) : undefined} />)}
  </div>;
  const Heading = headingLevel;
  if (section.collapsed) return <>
    <Heading><button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}
      className="flex w-full cursor-pointer items-center gap-2 border-y border-border px-1 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.13em] text-zinc-300 hover:text-white">
      <span className="min-w-0 flex-1 truncate">{section.title}</span>
      <ChevronDown size={15} className={open ? "rotate-180 text-accent" : "text-muted"} aria-hidden="true" />
    </button></Heading>
    {open && section.description && <p className="mt-2 text-[11px] leading-5 text-subtle">{section.description}</p>}
    {open && <div className="mt-2">{rows}</div>}
    {open && section.links.length > previewSize && <button type="button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}
      className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-white/[0.02] px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-accent/40 hover:text-white">
      {showAll ? t("inspector.showLess") : t("inspector.showMoreCount", { count: hiddenCount })}
      <ChevronDown size={14} className={showAll ? "rotate-180 transition-transform" : "transition-transform"} aria-hidden="true" />
    </button>}
  </>;
  return <>
    {section.description && <p className="mb-2 text-[11px] leading-5 text-subtle">{section.description}</p>}
    {rows}
    {section.links.length > previewSize && <button type="button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}
      className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-white/[0.02] px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-accent/40 hover:text-white">
      {showAll ? t("inspector.showLess") : t("inspector.showMoreCount", { count: hiddenCount })}
      <ChevronDown size={14} className={showAll ? "rotate-180 transition-transform" : "transition-transform"} aria-hidden="true" />
    </button>}
  </>;
};

const FactRows = ({ facts }: { facts: readonly InspectorFact[] }) => <dl className="divide-y divide-border/70 border-y border-border/70">
  {facts.map(fact => <div key={fact.key} className="py-3">
    <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{fact.label}</dt>
    <dd className="mt-1 break-words text-[13px] leading-[1.55] text-zinc-100">
      {fact.value}{fact.note && <span className="mt-1 block text-zinc-400">{fact.note}</span>}
    </dd>
  </div>)}
</dl>;

const PillSections = ({ sections }: { sections: readonly InspectorPillSection[] }) => <>
  {sections.map(section => <section key={section.key}>
    <SectionTitle level="h4">{section.title}</SectionTitle>
    <div className="flex flex-wrap gap-2" role="list">
      {section.values.map(value => <span key={value} role="listitem"
        className="rounded-[var(--radius-full)] border border-accent/30 bg-accent-soft px-3 py-1.5 text-[12px] font-medium text-zinc-100">
        {value}
      </span>)}
    </div>
  </section>)}
</>;

const LinkedSections = ({ sections, content, onNavigate, onSearchStructureMap, headingLevel, parentTitle }: {
  sections: readonly InspectorSection[];
  content: InspectorContent;
  onNavigate: GameGuideDetailPageProps["onNavigate"];
  onSearchStructureMap?: GameGuideDetailPageProps["onSearchStructureMap"];
  headingLevel: "h3" | "h4";
  parentTitle?: string;
}) => <>
  {sections.map(section => <section key={section.key}>
    {!section.collapsed && section.title !== parentTitle && !section.title.startsWith(`${parentTitle} · `)
      && <SectionTitle level={headingLevel}>{section.title}
      {section.links.length > 1 ? ` · ${section.links.length}` : ""}</SectionTitle>}
    <SectionLinks key={`${content.name}:${section.key}`} section={section} onNavigate={onNavigate}
      onSearchStructureMap={onSearchStructureMap}
      interactive={content.sectionLinksInteractive !== false} headingLevel={headingLevel} />
  </section>)}
</>;

const GuideSections = ({ sections, content, onNavigate, onSearchStructureMap }: {
  sections: readonly InspectorGuideSection[];
  content: InspectorContent;
  onNavigate: GameGuideDetailPageProps["onNavigate"];
  onSearchStructureMap?: GameGuideDetailPageProps["onSearchStructureMap"];
}) => <div className="max-w-[800px]">
  {sections.map(section => <section key={section.key} aria-labelledby={`guide-section-${section.key}`}
    className="border-t border-border/70 py-6 first:border-t-0 first:pt-0">
    <h3 id={`guide-section-${section.key}`} className="mb-4 flex items-center gap-3 text-[16px] font-semibold leading-6 text-white">
      <span className="h-4 w-[3px] shrink-0 rounded-full bg-accent" aria-hidden="true" />{section.title}
    </h3>
    <div className="space-y-5 pl-[15px]">
      <InspectorHeroImage src={section.heroImage} alt={content.name} />
      {section.facts && section.facts.length > 0 && <FactRows facts={section.facts} />}
      {section.description && <p className="whitespace-pre-line text-[13px] leading-relaxed text-zinc-300">{section.description}</p>}
      {section.body && <div className="min-w-0">{section.body}</div>}
      {section.pillSections && <PillSections sections={section.pillSections} />}
      {section.sections && <LinkedSections sections={section.sections} content={content} onNavigate={onNavigate}
        onSearchStructureMap={onSearchStructureMap}
        headingLevel="h4" parentTitle={section.title} />}
    </div>
  </section>)}
</div>;

const GameGuideDetailPage = ({ content, onNavigate, onSearchStructureMap, backLabel, onBack, focusHeading }: GameGuideDetailPageProps) => {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  const page = useRef<HTMLElement>(null);
  const isGuide = Boolean(content.guideSections);
  const behavior = isGuide ? content.facts?.find(fact => fact.key === "behavior") : undefined;
  const headerFacts = isGuide ? content.facts?.filter(fact => fact.key !== "behavior"
    && fact.key !== "biome-spawns" && fact.key !== "spawn-category") : undefined;
  useEffect(() => {
    page.current?.scrollTo({ top: 0 });
    if (focusHeading) heading.current?.focus({ preventScroll: true });
  }, [content.name, content.category, focusHeading]);
  return <GuideNavigationContext.Provider value={onNavigate}><article ref={page} className="inspector-scroll h-full overflow-y-auto">
    <header className="relative overflow-hidden border-b border-border px-5 py-5 sm:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(115%_130%_at_0%_0%,rgba(var(--gold-rgb),0.14),transparent_62%)]" />
      {backLabel && onBack && <button type="button" onClick={onBack}
        className="relative mb-4 flex max-w-[800px] cursor-pointer items-center gap-1.5 text-[12px] font-medium text-white hover:text-accent">
        <ChevronLeft size={15} aria-hidden="true" />
        <span className="truncate">{t("inspector.backTo", { label: backLabel })}</span>
      </button>}
      <div className="relative flex max-w-[800px] items-start gap-4">
        <div className="grid h-[80px] w-[80px] shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/35 bg-black/30 p-2 shadow-[0_0_26px_-10px_var(--color-accent)]">
          <InspectorSubjectIcon image={content.image} images={content.iconImages} fallback={content.fallbackIcon} size={64}
            imageClassName="game-guide-detail-image" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">{content.category}</p>
            {behavior && <span className="rounded-[var(--radius-full)] border border-accent/25 bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-zinc-100">
              {behavior.value}
            </span>}
            {behavior?.note && <span className="text-[11px] text-zinc-300">{behavior.note}</span>}
          </div>
          <h2 ref={heading} tabIndex={-1} className="mt-1 break-words text-[25px] font-semibold leading-[1.15] text-white outline-none">{content.name}</h2>
          {isGuide && content.description && <p className="mt-2 max-w-[680px] text-[13px] leading-[1.6] text-zinc-300">
            {content.description}
          </p>}
          {headerFacts && headerFacts.length > 0 && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-white/10 pt-3 text-[11px]">
            {headerFacts.map(fact => <span key={fact.key} className="text-subtle">{fact.label} <strong
              className="ml-1 font-semibold text-zinc-100">{fact.value}</strong></span>)}
          </div>}
        </div>
      </div>
    </header>
    <div className="px-5 py-6 sm:px-6">
      {content.guideSections ? <GuideSections sections={content.guideSections} content={content} onNavigate={onNavigate}
          onSearchStructureMap={onSearchStructureMap} />
        : <div className="max-w-[760px] space-y-5">
          <InspectorHeroImage src={content.heroImage} alt={content.name} />
          {content.facts && content.facts.length > 0 && <FactRows facts={content.facts} />}
          {content.description && <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-zinc-300">{content.description}</p>}
          {content.body && <div className={content.bodyUnframed ? "overflow-x-auto" : "overflow-x-auto rounded-[var(--radius-md)] border border-border bg-white/[0.02] p-4"}>{content.body}</div>}
          {content.pillSections && <PillSections sections={content.pillSections} />}
          {content.sections && <LinkedSections sections={content.sections} content={content} onNavigate={onNavigate}
            onSearchStructureMap={onSearchStructureMap} headingLevel="h3" />}
        </div>}
    </div>
  </article></GuideNavigationContext.Provider>;
};

export default GameGuideDetailPage;
