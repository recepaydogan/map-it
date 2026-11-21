import { BookOpen, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { createElement, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MAP_DATA_BASE_URL } from "../map/map-data-url";
import { requestMapDestinationInMain } from "../map/map-window-bridge";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import SpellLink from "../spells/spell-link";
import { useSpellIndex } from "../spells/spell-data";
import type { StarterGuide } from "./starter-guide-data";

const ALLOWED = new Set(["p", "h2", "h3", "h4", "ul", "ol", "li", "b", "strong", "em", "i", "small", "table", "thead", "tbody", "tr", "th", "td", "blockquote", "cite", "code", "br", "div", "span", "sup", "sub", "hr"]);
const REFERENCE_CATEGORIES: Record<string, string> = {
  item: "items", class: "classes", race: "races", profession: "professions", dungeon: "dungeons", guide: "guides", spell: "spells",
};
const RESOURCE_COLORS: Record<string, string> = {
  rage: "var(--color-danger-text)",
  mana: "var(--color-grade-heroic)",
  energy: "var(--gold-bright)",
  focus: "var(--color-grade-rare)",
};
const RESOURCE_PATTERN = /\b(?:Rage|rage|Mana|mana|Energy|energy|Focus)\b/g;

const renderResourceText = (value: string, key: string): ReactNode => {
  const parts: ReactNode[] = [];
  let start = 0;
  for (const match of value.matchAll(RESOURCE_PATTERN)) {
    const index = match.index;
    if (index > start) parts.push(value.slice(start, index));
    parts.push(<span key={`${key}-${index}`} style={{ color: RESOURCE_COLORS[match[0].toLowerCase()] }}>{match[0]}</span>);
    start = index + match[0].length;
  }
  if (!parts.length) return value;
  if (start < value.length) parts.push(value.slice(start));
  return <>{parts}</>;
};

let zephrasCenterRequest: Promise<{ x: number; y: number } | null> | null = null;
const openZephrasMap = async (name: string) => {
  zephrasCenterRequest ??= fetch(`${MAP_DATA_BASE_URL}/world-atlas/metadata.json`).then(async (response) => {
    if (!response.ok) throw new Error(`Map metadata: HTTP ${response.status}`);
    const data = await response.json() as { terrainLayers?: { id: string; originX: number; originY: number; scaleX: number; scaleY: number; sourceBounds: { minX: number; maxX: number; minY: number; maxY: number } }[] };
    const layer = data.terrainLayers?.find((item) => item.id === "zephras-isle");
    if (!layer) return null;
    const x = layer.originX + (layer.sourceBounds.minX + layer.sourceBounds.maxX) / 2 * layer.scaleX;
    const y = layer.originY + (layer.sourceBounds.minY + layer.sourceBounds.maxY) / 2 * layer.scaleY;
    return Number.isFinite(x) && Number.isFinite(y) ? { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 } : null;
  }).catch(() => null);
  const center = await zephrasCenterRequest;
  requestMapDestinationInMain("azeroth", center ? { name, ...center } : undefined);
};

const GuideMapCoordinate = ({ children, x, y, name }: { children: ReactNode; x: string; y: string; name: string }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return <span className="inline"><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={t("guides.showMapCoordinates", { name })} className="inline cursor-pointer text-accent underline decoration-dotted underline-offset-2 hover:brightness-125 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent">{children}</button>{open && <span className="ml-1 inline rounded-[var(--radius-sm)] border border-border bg-surface px-1.5 py-0.5 text-[11px] text-zinc-200" role="note">{t("guides.mapCoordinates", { x, y })} · {t("guides.mapCoordinateCaution")}</span>}</span>;
};

const revealGuideContent = (content: HTMLElement) => {
  for (let parent = content.parentElement; parent; parent = parent.parentElement) {
    if (!/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) continue;
    const offset = content.getBoundingClientRect().top - parent.getBoundingClientRect().top - 16;
    if (offset < -8) parent.scrollTo({
      top: parent.scrollTop + offset,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
    break;
  }
};

const StarterGuideArticle = ({ guide, tone = "default" }: { guide: StarterGuide; tone?: "default" | "class-leveling" }) => {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  const { rows: spellIndex } = useSpellIndex();
  const spellIcons = useMemo(() => new Map(spellIndex?.map(([id, , , iconId]) => [id, iconId]) ?? []), [spellIndex]);
  const contentRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState({ guideId: guide.id, index: 0 });
  const sections = useMemo(() => {
    const doc = new DOMParser().parseFromString(guide.html, "text/html");
    const render = (node: Node, key: string, inLink = false): ReactNode => {
      if (node.nodeType === Node.TEXT_NODE) return inLink ? node.textContent : renderResourceText(node.textContent ?? "", key);
      if (!(node instanceof HTMLElement)) return null;
      const tag = node.tagName.toLowerCase();
      const children = [...node.childNodes].map((child, index) => render(child, `${key}-${index}`, inLink || tag === "a"));
      if (tag === "a") {
        const destination = node.dataset.guideLink ?? "";
        const separator = destination.indexOf(":");
        const kind = destination.slice(0, separator);
        const id = destination.slice(separator + 1);
        if (kind === "map-pin") {
          const [, x, y] = id.split(":");
          if (x && y) return <GuideMapCoordinate key={key} x={x} y={y} name={node.textContent ?? ""}>{children}</GuideMapCoordinate>;
        }
        if (kind === "map-view" && id === "zephras-isle") return <button key={key} type="button" onClick={() => { void openZephrasMap(node.textContent ?? t("map.zephrasIsle")); }} className="cursor-pointer text-accent underline decoration-accent/50 underline-offset-2 hover:brightness-125 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent">{children}</button>;
        if (kind === "spell" && /^\d+$/.test(id)) return <SpellLink key={key} id={Number(id)} name={node.textContent ?? "Spell"} inlineIconId={spellIcons.get(Number(id))}>{children}</SpellLink>;
        if (REFERENCE_CATEGORIES[kind]) {
          const [entryId, view] = kind === "class" ? id.split(":") : [id, undefined];
          return <button key={key} type="button" onClick={() => openReference({ category: REFERENCE_CATEGORIES[kind], id: entryId, name: node.textContent ?? undefined, ...(view ? { group: view === "abilities" || view === "talents" ? view : `guide:${view}` } : {}) })} className="cursor-pointer text-accent underline decoration-accent/50 underline-offset-2 hover:brightness-125 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent">{children}</button>;
        }
        return <span key={key}>{children}</span>;
      }
      if (!ALLOWED.has(tag)) return <span key={key}>{children}</span>;
      return createElement(tag, { key, ...(tag.startsWith("h") ? { id: node.id } : {}) }, ...children);
    };
    const groups: { id: string; title: string; nodes: Node[] }[] = [];
    const opening: Node[] = [];
    for (const node of doc.body.childNodes) {
      if (node instanceof HTMLElement && node.tagName === "H2") {
        groups.push({ id: node.id, title: node.textContent ?? "", nodes: [node] });
      } else if (groups.length > 0) {
        groups[groups.length - 1].nodes.push(node);
      } else {
        opening.push(node);
      }
    }
    if (groups.length === 0) groups.push({ id: guide.id, title: guide.title, nodes: opening });
    else groups[0].nodes.splice(1, 0, ...opening);
    return groups.map((group) => ({
      id: group.id,
      title: group.title,
      content: group.nodes.map((node, index) => render(node, `${group.id}-${index}`)),
    }));
  }, [guide.html, guide.id, guide.title, openReference, spellIcons, t]);
  const activeIndex = selection.guideId === guide.id ? Math.min(selection.index, sections.length - 1) : 0;
  const selectSection = (index: number) => {
    if (index === activeIndex) return;
    if (contentRef.current) revealGuideContent(contentRef.current);
    setSelection({ guideId: guide.id, index });
  };

  return <article className="select-text min-w-0" aria-labelledby={`guide-${guide.id}`}>
    <header className="py-1">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#aeb3b8]"><BookOpen size={13} className="text-accent/80" aria-hidden="true" />{t(`guides.groups.${guide.group}`)}</p>
      <h2 id={`guide-${guide.id}`} className="mt-1 font-display text-xl font-semibold text-white @min-[650px]:text-2xl">{guide.title}</h2>
      <p className="mt-2 max-w-[85ch] text-[13px] leading-6 text-[#b9bdc1]">{tone === "class-leveling" ? guide.intro : renderResourceText(guide.intro, "intro")}</p>
    </header>
    <div className="mt-5 grid min-w-0 gap-5 @min-[850px]:grid-cols-[185px_minmax(0,1fr)]">
      <nav aria-label={t("guides.onThisPage")} className="min-w-0"><details className="group rounded-[var(--radius-md)] border border-border bg-surface @min-[850px]:sticky @min-[850px]:top-4 @min-[850px]:max-h-[calc(100vh-180px)] @min-[850px]:overflow-y-auto" open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-subtle marker:hidden">{t("guides.onThisPage")}<ChevronDown size={13} className="transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
        <ol className="space-y-0.5 border-t border-border px-2 py-2">{sections.map((heading, index) => <li key={heading.id}><button type="button" onClick={() => selectSection(index)} aria-current={index === activeIndex ? "step" : undefined} className={`flex w-full cursor-pointer gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12px] leading-5 hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-accent ${index === activeIndex ? "bg-accent-soft font-semibold text-white" : "text-zinc-200"}`}><span className="shrink-0 tabular-nums text-accent">{index + 1}.</span>{heading.title}</button></li>)}</ol>
      </details></nav>
      <div ref={contentRef} className="starter-guide-prose min-w-0 max-w-[850px] scroll-mt-4 text-[14px] leading-7 text-zinc-200 [&_b]:font-semibold [&_b]:text-white [&_blockquote]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-accent/70 [&_blockquote]:bg-accent-soft [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-zinc-200 [&_cite]:mt-2 [&_cite]:block [&_cite]:text-[11px] [&_cite]:not-italic [&_cite]:text-subtle [&_code]:rounded [&_code]:bg-white/[0.06] [&_code]:px-1 [&_h2]:mb-3 [&_h2]:mt-9 [&_h2]:scroll-mt-4 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-2 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-[15px] [&_h3]:text-white [&_li]:mb-1.5 [&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-5 [&_table]:mb-6 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-left [&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-accent/40 [&_th]:px-3 [&_th]:py-2 [&_th]:text-[11px] [&_th]:uppercase [&_th]:text-subtle [&_ul]:mb-5 [&_ul]:list-disc [&_ul]:pl-5"><div key={`${guide.id}-${activeIndex}`} className="guide-content-enter">{sections[activeIndex]?.content}</div>
        {sections.length > 1 && <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-4 text-[12px] font-semibold">
          {activeIndex > 0 ? <button type="button" onClick={() => selectSection(activeIndex - 1)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-2 text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"><ChevronLeft size={15} aria-hidden="true" />{t("guides.previousSection")}</button> : <span />}
          {activeIndex < sections.length - 1 && <button type="button" onClick={() => selectSection(activeIndex + 1)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border border-accent/40 bg-accent-soft px-3 py-2 text-accent hover:border-accent focus-visible:outline-2 focus-visible:outline-accent">{t("guides.nextSection")}<ChevronRight size={15} aria-hidden="true" /></button>}
        </div>}
      </div>
    </div>
  </article>;
};

export default StarterGuideArticle;
