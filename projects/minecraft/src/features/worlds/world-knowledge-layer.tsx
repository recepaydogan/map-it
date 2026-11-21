import { BookOpen, FileJson, LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { createInspectorController } from "../inspector/inspector-controller";
import type { InspectorSubject } from "../inspector/inspector-controller";
import InspectorLinkRow from "../inspector/inspector-link-row";
import InspectorViewport from "../inspector/inspector-viewport";
import { createConnectedKnowledgeInspectorResolver } from "../knowledge/connected-knowledge-inspector-content";
import { createMechanicsSubjectDisplay } from "../knowledge/mechanics-inspector-content";
import { knowledgeCatalogRevision, type KnowledgeCatalogs } from "../knowledge/knowledge-catalogs";
import { gameKnowledgeRecipeSubjectKind,
  gameKnowledgeSubjectDisplay as display } from "../knowledge/game-knowledge-subject-display";
import type { WorldRecord } from "./world-types";

const WorldKnowledgeLayer = ({ world, active, catalogs, catalogLoadPhase, onClose, sourceControl }: { world: WorldRecord; active: boolean;
  catalogs: KnowledgeCatalogs; catalogLoadPhase: "unconfigured" | "loading" | "ready" | "error";
  onClose: () => void; sourceControl?: ReactNode }) => {
  const { t, i18n } = useTranslation();
  const catalogRevision = knowledgeCatalogRevision(catalogs);
  const [controller] = useState(() => createInspectorController({ worldId: world.id, edition: world.edition,
    version: world.generation.version, dimension: null, catalogRevision }));
  const navigation = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const panelArea = useRef<HTMLDivElement>(null), returnFocus = useRef<HTMLElement | null>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(60);
  const [subjectKind, setSubjectKind] = useState<"all" | "item" | "entity" | "block" | "loot" | "trade" | "enchantment" | "advancement" | "biome" | "poi">("all");
  const { recipes: catalog, mechanics } = catalogs;
  useLayoutEffect(() => {
    const node = panelArea.current; if (!node) return;
    const update = () => setPanelWidth(node.clientWidth);
    update(); const observer = new ResizeObserver(update); observer.observe(node); return () => observer.disconnect();
  }, [active]);
  useEffect(() => {
    if (!active || navigation.entries.length) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      event.preventDefault(); event.stopPropagation(); onClose();
    };
    window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape);
  }, [active, navigation.entries.length, onClose]);
  useEffect(() => controller.setContext({ worldId: world.id, edition: world.edition, version: world.generation.version,
    dimension: null, catalogRevision }), [controller, world.id, world.edition, world.generation.version, catalogRevision]);
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const subjectDisplay = useMemo(() => mechanics ? createMechanicsSubjectDisplay(mechanics, display, locale) : display, [mechanics, locale]);
  const resolver = useMemo(() => createConnectedKnowledgeInspectorResolver(catalogs, display, t, locale,
    world.edition, world.generation.version),
  [catalogs, t, locale, world.edition, world.generation.version]);
  const subjects = useMemo(() => {
    const values = new Map<string, InspectorSubject>();
    if (catalog) for (const id of [...Object.keys(catalog.index.produces), ...Object.keys(catalog.index.usesItem)]) {
      const kind = gameKnowledgeRecipeSubjectKind(id);
      values.set(`${kind}:${id}`, { kind, id });
    }
    if (mechanics) for (const subject of mechanics.subjects) values.set(`${subject.kind}:${subject.id}`, { kind: subject.kind, id: subject.id });
    return [...values.values()].sort((left, right) => subjectDisplay(left.kind, left.id).name.localeCompare(
      subjectDisplay(right.kind, right.id).name, locale));
  }, [catalog, mechanics, subjectDisplay, locale]);
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-US");
    return subjects.filter(subject => {
      const name = subjectDisplay(subject.kind, subject.id).name;
      return (subjectKind === "all" || subject.kind === subjectKind)
        && (!needle || subject.id.toLocaleLowerCase("en-US").includes(needle) || name.toLocaleLowerCase(locale).includes(needle));
    });
  }, [subjects, subjectDisplay, query, locale, subjectKind]);
  const close = () => { controller.close(); onClose(); };
  if (!active) return null;
  const detailsOpen = navigation.entries.length > 0, showBase = !detailsOpen || panelWidth >= 700;
  const panelLeft = showBase ? 316 : 0;
  return <div ref={panelArea} data-world-knowledge className="pointer-events-none absolute inset-3 z-40">
    {showBase && <aside aria-label={t("inspector.guide")}
      className="pointer-events-auto absolute inset-y-0 left-0 flex w-[19rem] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/90 backdrop-blur-xl">
      <header className="relative shrink-0 border-b border-border px-4 py-3">
        <BookOpen size={17} className="mr-2 inline text-accent" aria-hidden="true" />
        <h2 className="inline text-sm font-semibold text-white">{t("inspector.guide")}</h2>
        <button type="button" data-close-guide onClick={close} aria-label={t("inspector.closeGuide")}
          className="absolute right-2 top-2 grid h-8 w-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/8 hover:text-white">
          <X size={16} aria-hidden="true" />
        </button>
        {sourceControl ?? <p className="mt-1 text-[11px] text-subtle">{world.edition} · {world.generation.version}</p>}
      </header>
      {!mechanics && catalogLoadPhase === "unconfigured" ? <div role="status" className="p-4 text-xs leading-5 text-zinc-300">{t("inspector.catalogUnavailable")}</div> : !catalog && !mechanics ?
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-5 text-center">
          {catalogLoadPhase === "loading" ? <LoaderCircle size={22} className="animate-spin text-accent" aria-hidden="true" />
            : <FileJson size={22} className="text-accent" aria-hidden="true" />}
          <p className="mt-3 text-sm font-semibold text-white">{t(catalogLoadPhase === "loading" ? "inspector.catalogLoading" : "inspector.catalogUnavailable")}</p>
          {catalogLoadPhase === "error" && <p role="alert" className="mt-3 text-xs leading-5 text-danger-text">{t("inspector.catalogError")}</p>}
        </div> : <>
          <div className="shrink-0 border-b border-border p-3">
            <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-black/25 px-2.5 py-2 focus-within:border-accent">
              <Search size={14} className="shrink-0 text-zinc-400" aria-hidden="true" />
              <input type="search" value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(60); }} aria-label={t("inspector.search")}
                placeholder={t("inspector.search")} className="min-w-0 flex-1 bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-400" />
            </div>
            <div className="mt-2 flex gap-1 overflow-x-auto" aria-label={t("inspector.subjectFilter")}>
              {(["all", "item", "entity", "block", "loot", "trade", "enchantment", "advancement", "biome", "poi"] as const).map(kind => <button key={kind} type="button"
                aria-pressed={subjectKind === kind} onClick={() => { setSubjectKind(kind); setVisibleCount(60); }}
                className="shrink-0 cursor-pointer rounded-full border border-border px-2 py-1 text-[10px] font-semibold text-zinc-300 hover:bg-white/8 aria-pressed:border-accent aria-pressed:bg-accent/15 aria-pressed:text-accent">
                {t(`inspector.subjectKinds.${kind}`)}
              </button>)}
            </div>
            <p role="status" data-knowledge-ready className="mt-2 text-[11px] text-subtle">{t("inspector.catalogReady", {
              subjects: subjects.length, recipes: catalog?.recipes.length ?? 0, mechanics: mechanics?.mechanics.length ?? 0 })}</p>
          </div>
          <div className="inspector-scroll min-h-0 flex-1 overflow-y-auto p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{t("inspector.catalogResultCount", { shown: Math.min(visibleCount, matches.length), total: matches.length })}</p>
            <div className="flex flex-col gap-1.5">{matches.slice(0, visibleCount).map(subject => <InspectorLinkRow key={`${subject.kind}:${subject.id}`}
              link={{ key: `${subject.kind}:${subject.id}`, subject, ...subjectDisplay(subject.kind, subject.id),
                note: t(`inspector.subjectKinds.${subject.kind}`) }} selected={false}
              onSelect={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                controller.open(subject); }} />)}</div>
            {visibleCount < matches.length && <button type="button" onClick={() => setVisibleCount(count => count + 60)}
              className="mt-3 w-full cursor-pointer rounded-[var(--radius-md)] border border-border p-2 text-xs text-accent hover:bg-surface-hover">{t("inspector.showMore")}</button>}
            {!matches.length && <p className="py-4 text-center text-xs text-zinc-300">{t("inspector.catalogNoResults")}</p>}
          </div>
        </>}
    </aside>}
    <div className="absolute inset-y-0 right-0" style={{ left: panelLeft }}>
      <InspectorViewport controller={controller} active={active} resolve={resolver} baseLabel={t("inspector.guide")}
        onDismiss={() => returnFocus.current?.focus({ preventScroll: true })} />
    </div>
  </div>;
};

export default WorldKnowledgeLayer;
