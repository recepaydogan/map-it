import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "../src/i18n";
import "./world-seed-search-check.css";
import WorldForm from "../src/features/worlds/world-form";
import type { NewWorld } from "../src/features/worlds/world-types";
import { runWorldSeedSearchBrowserChecks } from "./world-seed-search-browser-checks";

export const Diagnostic = () => {
  const surface = useRef<HTMLDivElement>(null), draw = useRef(0), saved = useRef<NewWorld | null>(null);
  const [report, setReport] = useState<unknown>(null), [running, setRunning] = useState(false);
  const run = async () => {
    if (!surface.current || running) return;
    draw.current = 0; saved.current = null; setRunning(true); setReport(null);
    try { setReport(await runWorldSeedSearchBrowserChecks(surface.current, () => saved.current)); }
    catch (error) { setReport({ status: "FAIL", error: String(error) }); }
    finally { setRunning(false); }
  };
  return <div ref={surface} className="seed-search-shell">
    <main className="seed-search-map">
      <div className="seed-search-panel"><WorldForm busy={false} drawSeed={() => String(draw.current++ % 128)} onSave={world => { saved.current = world; }} /></div>
    </main>
    <aside className="seed-search-rail"><h1>Reserved advertising rail · 440px</h1>
      <p>Runs the production form and packaged Java/Bedrock seed engines with a deterministic candidate sequence.</p>
      <button type="button" disabled={running} onClick={() => { void run(); }}>Run seed search checks</button>
      <pre role="status">{JSON.stringify(report, null, 2)}</pre>
    </aside>
  </div>;
};

createRoot(document.getElementById("root")!).render(<Diagnostic />);
