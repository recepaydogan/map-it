import { ChevronDown, ChevronLeft, MapPin, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import InspectorLinkRow from "./inspector-link-row";
import type { InspectorController, InspectorEntry, InspectorSubject } from "./inspector-controller";
import type { InspectorContent, InspectorFact, InspectorPillSection } from "./inspector-types";
import InspectorHeroImage from "./inspector-hero-image";
import InspectorSubjectIcon from "./inspector-subject-icon";

const InspectorPanelSection = ({ section, selected, onSelect }: {
  section: NonNullable<InspectorContent["sections"]>[number]; selected?: InspectorSubject;
  onSelect: (subject: InspectorSubject) => void;
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(!section.collapsed);
  const [showAll, setShowAll] = useState(false);
  const previewSize = Math.min(section.previewSize ?? 4, 4);
  const links = showAll ? section.links : section.links.slice(0, previewSize);
  const hiddenCount = section.links.length - links.length;
  return <section>
    {section.groupTitle && <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">{section.groupTitle}</h3>}
    {section.collapsed ? <h3><button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}
      className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-border bg-white/[0.02] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-300 hover:border-accent/40 hover:text-white">
      <span className="min-w-0 flex-1 truncate">{section.title}</span>
      <ChevronDown size={14} className={open ? "rotate-180 text-accent" : "text-muted"} aria-hidden="true" />
    </button></h3> : <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
      {section.title}{section.links.length > 1 ? ` · ${section.links.length}` : ""}
    </h3>}
    {open && <div className={section.collapsed ? "mt-1.5 flex flex-col gap-1.5" : "flex flex-col gap-1.5"}>{links.map(link =>
      <InspectorLinkRow key={link.key} link={link} selected={selected?.kind === link.subject.kind && selected.id === link.subject.id}
        onSelect={() => onSelect(link.subject)} />)}</div>}
    {open && section.links.length > previewSize && <button type="button" data-inspector-focus={`more:${section.key}`}
      aria-expanded={showAll} onClick={() => setShowAll(value => !value)}
      className="mt-1.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-white/[0.02] px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-accent/40 hover:text-white">
      {showAll ? t("inspector.showLess") : t("inspector.showMoreCount", { count: hiddenCount })}
      <ChevronDown size={14} className={cn("transition-transform", showAll && "rotate-180")} aria-hidden="true" />
    </button>}
  </section>;
};

const InspectorPanelFacts = ({ facts }: { facts: readonly InspectorFact[] }) => <dl className="divide-y divide-border/70 border-y border-border/70">
  {facts.map(fact => <div key={fact.key} className="py-2.5">
    <dt className="text-[10px] font-semibold uppercase tracking-wider text-subtle">{fact.label}</dt>
    <dd className="mt-1 text-[13px] leading-5 text-zinc-200">{fact.value}{fact.note && <span className="mt-1 block text-subtle">{fact.note}</span>}</dd>
  </div>)}
</dl>;

const InspectorPanelPills = ({ sections }: { sections: readonly InspectorPillSection[] }) => <>{sections.map(section =>
  <section key={section.key}>
    <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{section.title}</h4>
    <div className="flex flex-wrap gap-1.5" role="list">
      {section.values.map(value => <span key={value} role="listitem"
        className="rounded-[var(--radius-full)] border border-accent/30 bg-accent-soft px-2.5 py-1 text-[11px] font-medium leading-4 text-zinc-100">
        {value}
      </span>)}
    </div>
  </section>)}</>;

interface Props {
  entry: InspectorEntry; content: InspectorContent; controller: InspectorController;
  selected?: InspectorSubject; backLabel?: string; onBack?: () => void; onClose: () => void; focusOnMount: boolean; notice?: string;
}

/** ER's 360px identity card, close affordance and single independently scrolling body. */
const InspectorPanel = ({ entry, content, controller, selected, backLabel, onBack, onClose, focusOnMount, notice }: Props) => {
  const { t } = useTranslation();
  const behavior = content.guideSections ? content.facts?.find(fact => fact.key === "behavior") : undefined;
  const visibleFacts = content.guideSections ? content.facts?.filter(fact => fact.key !== "behavior"
    && fact.key !== "biome-spawns" && fact.key !== "spawn-category") : content.facts;
  const panel = useRef<HTMLElement>(null), body = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const remember = () => {
    const focused = document.activeElement instanceof HTMLElement && panel.current?.contains(document.activeElement)
      ? document.activeElement.dataset.inspectorFocus ?? null : controller.getView(entry.key).focusKey;
    controller.saveView(entry.key, { scrollTop: body.current?.scrollTop ?? 0, focusKey: focused });
  };
  useLayoutEffect(() => {
    const saved = controller.getView(entry.key);
    if (body.current) body.current.scrollTop = saved.scrollTop;
    if (focusOnMount) {
      const target = [...(panel.current?.querySelectorAll<HTMLElement>("[data-inspector-focus]") ?? [])].find(element => element.dataset.inspectorFocus === saved.focusKey);
      (target ?? heading.current)?.focus({ preventScroll: true });
    }
  }, [controller, entry.key, focusOnMount]);
  return (
    <aside ref={panel} aria-label={content.name} data-inspector-entry={entry.key}
      className="inspector-panel pointer-events-auto flex max-h-full w-90 min-w-0 shrink-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/90 backdrop-blur-xl [max-width:100%]"
      onFocusCapture={remember}>
      {onBack && <button type="button" data-inspector-focus="back" onClick={() => { remember(); onBack(); }}
        className="flex w-full shrink-0 cursor-pointer items-center gap-1 px-4 pt-3 text-xs font-medium text-white hover:text-accent">
        <ChevronLeft size={15} aria-hidden="true" /><span className="truncate">{t("inspector.backTo", { label: backLabel })}</span>
      </button>}
      <header className={cn("relative mb-4 flex shrink-0 items-start gap-3 border-b border-border bg-surface/95 px-4 pb-4 backdrop-blur-xl", onBack ? "pt-2.5" : "pt-4")}>
        <button type="button" onClick={() => { remember(); onClose(); }} aria-label={t("inspector.closeDetails")}
          className="absolute right-3 top-3 grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/8 hover:text-white">
          <X size={16} aria-hidden="true" />
        </button>
        <span className="grid h-14 w-14 shrink-0 place-items-center text-accent"><InspectorSubjectIcon image={content.image}
          images={content.iconImages} fallback={content.fallbackIcon} size={56} /></span>
        <div className="min-w-0 pr-8">
          <h2 ref={heading} tabIndex={-1} className="break-words text-base font-semibold leading-tight text-white outline-none">{content.name}</h2>
          <p className="mt-0.5 text-xs text-subtle">{content.category}</p>
          {behavior && <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-[var(--radius-full)] border border-accent/25 bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-zinc-100">{behavior.value}</span>
            {behavior.note && <span className="text-[11px] text-zinc-300">{behavior.note}</span>}
          </div>}
          {content.contextLabel && <p className="mt-1 flex items-center gap-1 text-[11px] text-subtle">
            <MapPin size={11} className="shrink-0 text-accent" aria-hidden="true" />{content.contextLabel}
          </p>}
        </div>
      </header>
      {notice && <p role="alert" className="mx-4 mb-3 shrink-0 text-xs leading-5 text-warning">{notice}</p>}
      <div ref={body} data-inspector-body tabIndex={0} aria-label={t("inspector.content")} onScroll={remember}
        className="inspector-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="inspector-scroll-content space-y-3.5 px-4 pb-4">
          <InspectorHeroImage src={content.heroImage} alt={content.name} />
          {content.description && <p className="whitespace-pre-line text-[13px] leading-relaxed text-zinc-300">{content.description}</p>}
          {content.body}
          {visibleFacts && visibleFacts.length > 0 && <InspectorPanelFacts facts={visibleFacts} />}
          {!content.guideSections && content.pillSections && <InspectorPanelPills sections={content.pillSections} />}
          {content.summarySections?.map(section => <InspectorPanelSection key={section.key} section={section} selected={selected}
            onSelect={subject => { remember(); controller.navigate(entry.key, subject); }} />)}
          {content.footer}
          {content.guideSections?.filter(section => section.key !== "overview").map(section => <section key={section.key}
            className="space-y-3 border-t border-border pt-3">
            <h3 className="text-sm font-semibold text-white">{section.title}</h3>
            {section.description && <p className="text-xs leading-5 text-zinc-300">{section.description}</p>}
            {section.facts && <InspectorPanelFacts facts={section.facts} />}
            {section.body}
            {section.pillSections && <InspectorPanelPills sections={section.pillSections} />}
            {section.sections?.map(links => <InspectorPanelSection key={links.key} section={links} selected={selected}
              onSelect={subject => { remember(); controller.navigate(entry.key, subject); }} />)}
          </section>)}
          {!content.guideSections && content.sections?.map(section => <InspectorPanelSection key={section.key} section={section} selected={selected}
            onSelect={subject => { remember(); controller.navigate(entry.key, subject); }} />)}
        </div>
      </div>
    </aside>
  );
};

export default InspectorPanel;
