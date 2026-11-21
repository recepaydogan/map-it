import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "../src/i18n";
import "./world-knowledge-check.css";
import { GAME_RECIPE_SOURCES } from "../src/game-config";
import type { RecipeInspectorCatalog } from "../src/features/knowledge/recipe-inspector-content";
import { emptyPersonalState, type WorldRecord } from "../src/features/worlds/world-types";
import WorldKnowledgeLayer from "../src/features/worlds/world-knowledge-layer";
import { runWorldKnowledgeBrowserChecks } from "./world-knowledge-browser-checks";
import { mechanicsCatalogFixture } from "./mechanics-catalog-fixture";
import type { KnowledgeCatalogs } from "../src/features/knowledge/knowledge-catalogs";
import { EMPTY_KNOWLEDGE_CATALOGS } from "../src/features/knowledge/knowledge-catalogs";
import WorldStructureLayer from "../src/features/worlds/world-structure-layer";

const imports = import.meta.glob("../node_modules/.cache/recipe-catalogs/*.json", { import: "default", query: "?catalog-schema=2", eager: true });
const source = GAME_RECIPE_SOURCES.find(candidate => candidate.edition === "java")!;
const artifact = imports[`../node_modules/.cache/recipe-catalogs/${source.edition}-${source.version}.json`] as RecipeInspectorCatalog & object;
const mechanics = mechanicsCatalogFixture(source.edition, source.version);
const world: WorldRecord = { schemaVersion: 1, id: "knowledge-diagnostic", name: "Guide diagnostic", edition: source.edition,
  generation: { version: source.version, seed: "1", preset: "default", settings: {} }, association: null, favorite: false,
  createdAt: 1, lastOpenedAt: 1, movedToBottomAt: null, personal: emptyPersonalState() };

export const Diagnostic = () => {
  const surface = useRef<HTMLDivElement>(null);
  const [report, setReport] = useState<unknown>(null), [running, setRunning] = useState(false), [open, setOpen] = useState(true);
  const [catalogs, setCatalogs] = useState<KnowledgeCatalogs>(EMPTY_KNOWLEDGE_CATALOGS);
  const run = async () => {
    if (!surface.current || running) return;
    setRunning(true); setReport(null); setOpen(true);
    try { setReport(await runWorldKnowledgeBrowserChecks(surface.current, artifact, mechanics)); }
    catch (error) { setReport({ status: "FAIL", error: String(error) }); }
    finally { setRunning(false); }
  };
  return <div ref={surface} className="knowledge-shell">
    <main className="knowledge-map">
      <div className="knowledge-toolbar">Production world guide diagnostic · {source.edition} {source.version}</div>
      <WorldKnowledgeLayer world={world} active={open} catalogs={catalogs} onClose={() => setOpen(false)} onCatalogsChange={setCatalogs} />
      <WorldStructureLayer world={world} dimension="overworld" active={!open}
        view={{ ready: 1, total: 1, scale: 1, error: false, panning: false, x: 0, z: 0, zoom: 1, width: 840, height: 800 }}
        state={{ phase: "ready", completed: 1, total: 1, unsupported: [], error: null,
          points: [{ id: "fixture:village-point", type: "village", x: 120, y: null, z: 80, biomeViable: true, terrainVerified: false }] }}
        filter={{ visibleCategories: ["village"], expandedGroup: null, search: "", hideFound: false, favoritesOnly: false }}
        player={null} knowledgeCatalogs={catalogs} onFilterChange={() => {}}
        savePersonal={async (_worldId, change) => change(world.personal)} onCenter={() => {}} onDisperse={() => {}} onDismiss={() => {}} />
    </main>
    <aside className="knowledge-rail">
      <h1>Reserved advertising rail · 440px</h1>
      <p>Cached catalog data is used only by this isolated development check.</p>
      <button type="button" disabled={running} onClick={() => { void run(); }}>Run production guide checks</button>
      <pre role="status">{JSON.stringify(report, null, 2)}</pre>
    </aside>
  </div>;
};
createRoot(document.getElementById("root")!).render(<Diagnostic />);
