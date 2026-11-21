import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "../src/i18n";
import "./inspector-check.css";
import { GAME_RECIPE_SOURCES } from "../src/game-config";
import { createInspectorController } from "../src/features/inspector/inspector-controller";
import InspectorViewport from "../src/features/inspector/inspector-viewport";
import InspectorLinkRow from "../src/features/inspector/inspector-link-row";
import { createRecipeInspectorResolver, type RecipeInspectorCatalog } from "../src/features/knowledge/recipe-inspector-content";
import { runInspectorBrowserChecks } from "./inspector-browser-checks";

// Development-only imports: cached source data is never an application build entry.
const imports = import.meta.glob("../node_modules/.cache/recipe-catalogs/*.json", { import: "default", query: "?catalog-schema=2" });
type Artifact = RecipeInspectorCatalog & { schemaVersion: number; source: { edition: string; version: string; revision: string }; report: Record<string, unknown> };
const display = (_kind: string, id: string) => ({ name: id });
const firstSource = GAME_RECIPE_SOURCES[0];
const controller = createInspectorController({ worldId: "diagnostic-world", edition: firstSource.edition,
  version: firstSource.version, dimension: "diagnostic-dimension", catalogRevision: firstSource.revision });

export const Diagnostic = () => {
  const { t } = useTranslation();
  const [sourceIndex, setSourceIndex] = useState(0), [artifact, setArtifact] = useState<Artifact | null>(null);
  const [error, setError] = useState<string | null>(null), [query, setQuery] = useState("");
  const [report, setReport] = useState<unknown>(null), [running, setRunning] = useState(false);
  const base = useRef<HTMLDivElement>(null), trigger = useRef<HTMLElement | null>(null), surface = useRef<HTMLDivElement>(null);
  const testRun = useRef<AbortController | null>(null);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => () => { testRun.current?.abort(); }, []);
  useEffect(() => {
    const source = GAME_RECIPE_SOURCES[sourceIndex]; let cancelled = false;
    controller.setContext({ worldId: "diagnostic-world", edition: source.edition, version: source.version,
      dimension: "diagnostic-dimension", catalogRevision: source.revision });
    const load = imports[`../node_modules/.cache/recipe-catalogs/${source.edition}-${source.version}.json`];
    void (async () => {
      if (!load) throw new Error("Missing local recipe catalog. Run npm run build:recipe-catalogs.");
      const result = await load() as Artifact;
      if (result.schemaVersion !== 2) throw new Error("Cached recipe catalog schema is obsolete. Run npm run build:recipe-catalogs.");
      if (result.source.edition !== source.edition || result.source.version !== source.version || result.source.revision !== source.revision)
        throw new Error("Cached catalog does not match its configured source revision.");
      if (!cancelled) setArtifact(result);
    })().catch(reason => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; };
  }, [sourceIndex]);
  const resolve = useMemo(() => artifact ? createRecipeInspectorResolver(artifact, display, t) : () => null, [artifact, t]);
  const items = useMemo(() => artifact ? [...new Set([...Object.keys(artifact.index.produces), ...Object.keys(artifact.index.usesItem)])].sort() : [], [artifact]);
  const open = (id: string, target: HTMLElement) => { trigger.current = target; controller.open({ kind: "item", id }); };
  const run = async () => {
    if (!artifact || !surface.current || running) return;
    const abort = new AbortController(); testRun.current = abort;
    controller.setContext({ worldId: "diagnostic-world", edition: artifact.source.edition, version: artifact.source.version,
      dimension: "diagnostic-dimension", catalogRevision: artifact.source.revision });
    setRunning(true); setReport(null);
    try {
      const result = await runInspectorBrowserChecks(controller, artifact, surface.current, abort.signal);
      if (!abort.signal.aborted) setReport(result);
    } catch (reason) { if (!abort.signal.aborted) setReport({ status: "FAIL", error: String(reason) }); }
    finally { if (!abort.signal.aborted) setRunning(false); }
  };
  return <div ref={surface} className="diagnostic-shell">
    <main className="diagnostic-map">
      <div className="diagnostic-toolbar">
        <select aria-label={t("worlds.edition")} disabled={running} value={sourceIndex} onChange={event => {
          controller.close(); setArtifact(null); setError(null); setReport(null); setSourceIndex(Number(event.target.value));
        }} className="rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-xs">
          {GAME_RECIPE_SOURCES.map((source, index) => <option key={source.edition} value={index}>{source.edition} · {source.version}</option>)}
        </select>
        <span className="text-xs text-subtle">{t("inspector.diagnosticNotice")}</span>
      </div>
      <div className="diagnostic-panels">
        <div ref={base} hidden={snapshot.entries.length > 0} className="diagnostic-base overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/90">
          <header className="shrink-0 border-b border-border p-4">
            <h1 className="mb-3 text-base font-semibold">{t("inspector.guide")}</h1>
            <input type="search" aria-label={t("inspector.search")} value={query} onChange={event => setQuery(event.target.value)}
              className="w-full rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-3 py-2 text-xs" />
          </header>
          <div className="diagnostic-base-list space-y-1.5 p-4">
            {items.filter(id => id.toLowerCase().includes(query.toLowerCase())).map(id => <InspectorLinkRow key={id}
              link={{ key: id, subject: { kind: "item", id }, name: id }} selected={false}
              onSelect={() => open(id, document.activeElement as HTMLElement)} />)}
          </div>
        </div>
        <InspectorViewport controller={controller} resolve={resolve} baseLabel={t("inspector.guide")}
          onDismiss={() => trigger.current?.focus({ preventScroll: true })} />
      </div>
    </main>
    <aside className="diagnostic-rail" aria-label={t("inspector.diagnosticRail")}>
      <h2 className="text-sm font-semibold">{t("inspector.diagnosticRail")}</h2>
      <p className="my-3 text-xs leading-5 text-subtle">{t("inspector.diagnosticSources")}</p>
      <button type="button" disabled={!artifact || running} onClick={() => { void run(); }}
        className="mb-4 cursor-pointer rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-xs disabled:opacity-70">{t("inspector.runChecks")}</button>
      <pre role="status" className="whitespace-pre-wrap break-all text-xs leading-5">{error ?? JSON.stringify(report ?? artifact?.report ?? null, null, 2)}</pre>
    </aside>
  </div>;
};

createRoot(document.getElementById("root")!).render(<Diagnostic />);
