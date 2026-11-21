import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import i18n from "../src/i18n";
import "./world-knowledge-check.css";
import { resolveBuiltInMechanicsCatalog } from "../src/features/knowledge/built-in-mechanics-catalog";
import { resolveBuiltInRecipeCatalog } from "../src/features/knowledge/built-in-recipe-catalog";
import type { KnowledgeCatalogs } from "../src/features/knowledge/knowledge-catalogs";
import { emptyPersonalState, type WorldRecord } from "../src/features/worlds/world-types";
import WorldKnowledgeLayer from "../src/features/worlds/world-knowledge-layer";
import WorldStructureLayer from "../src/features/worlds/world-structure-layer";
import { runWorldBuiltInKnowledgeBrowserChecks } from "./world-built-in-knowledge-browser-checks";

const mechanics = resolveBuiltInMechanicsCatalog("java", "1.20.6", "en",
  (locale, key) => i18n.getFixedT(locale)(key));
const recipes = resolveBuiltInRecipeCatalog("java", "1.20.6");
if (!mechanics || !recipes) throw new Error("Missing built-in Java 1.20.6 horse catalog");
const catalogs: KnowledgeCatalogs = { recipes, mechanics };
const world: WorldRecord = { schemaVersion: 1, id: "built-in-knowledge-diagnostic", name: "Built-in guide diagnostic", edition: "java",
  generation: { version: "1.20.6", seed: "1", preset: "default", settings: {} }, association: null, favorite: false,
  createdAt: 1, lastOpenedAt: 1, movedToBottomAt: null, personal: emptyPersonalState() };

export const Diagnostic = () => {
  const surface = useRef<HTMLDivElement>(null);
  const [report, setReport] = useState<unknown>(null), [running, setRunning] = useState(false), [open, setOpen] = useState(true);
  const run = async () => {
    if (!surface.current || running) return;
    setRunning(true); setReport(null); setOpen(true);
    try { setReport(await runWorldBuiltInKnowledgeBrowserChecks(surface.current)); }
    catch (error) { setReport({ status: "FAIL", error: String(error) }); }
    finally { setRunning(false); }
  };
  return <div ref={surface} className="knowledge-shell">
    <main className="knowledge-map">
      <div className="knowledge-toolbar">Built-in horse guide diagnostic · Java 1.20.6</div>
      <WorldKnowledgeLayer world={world} active={open} catalogs={catalogs} onClose={() => setOpen(false)} onCatalogsChange={() => {}} />
      <WorldStructureLayer world={world} dimension="overworld" active={!open}
        view={{ ready: 1, total: 1, scale: 1, error: false, panning: false, x: 0, z: 0, zoom: 1, width: 840, height: 800 }}
        state={{ phase: "ready", completed: 1, total: 1, unsupported: [], error: null,
          points: [{ id: "built-in:village", type: "village", x: 120, y: null, z: 80, biomeViable: true, terrainVerified: false }] }}
        filter={{ visibleCategories: ["village"], expandedGroup: null, search: "", hideFound: false, favoritesOnly: false }}
        player={null} knowledgeCatalogs={catalogs} onFilterChange={() => {}}
        savePersonal={async (_worldId, change) => change(world.personal)} onCenter={() => {}} onDisperse={() => {}} onDismiss={() => {}} />
    </main>
    <aside className="knowledge-rail">
      <h1>Reserved advertising rail · 440px</h1>
      <p>Exact-version built-in data and original atlas artwork are used by this isolated development check.</p>
      <button type="button" disabled={running} onClick={() => { void run(); }}>Run built-in guide checks</button>
      <pre role="status">{JSON.stringify(report, null, 2)}</pre>
    </aside>
  </div>;
};

createRoot(document.getElementById("root")!).render(<Diagnostic />);
