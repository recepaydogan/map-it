import { createRoot } from "react-dom/client";
import { useWorldJourney } from "../src/features/journey/use-world-journey.ts";
import { WorldJourneyLayer, WorldJourneySummary } from "../src/features/journey/world-journey-layer.tsx";
import { getBrowserJourneyStorage } from "../src/features/journey/journey-storage.ts";
import "../src/i18n/index.ts";
import "../src/index.css";

const worldId = "journey-browser-diagnostic";
const storage = getBrowserJourneyStorage();
storage.remove(worldId);
storage.setVisible(worldId, true);
const read = storage.read(worldId);
storage.writeData({ ...read.data, latest: {
  id: "fixture-route", worldId, sessionKey: "fixture-session", startedAt: 1_000, endedAt: 5_000,
  pendingBreak: false, truncated: false, segments: [
    { dimension: "overworld", points: [{ x: -220, y: 64, z: -70, at: 1_000 }, { x: -60, y: 65, z: 0, at: 2_000 },
      { x: 80, y: 70, z: 35, at: 3_000 }, { x: 260, y: 68, z: 120, at: 4_000 }] },
    { dimension: "nether", points: [{ x: 1, y: 64, z: 1, at: 5_000 }] },
  ],
}, updatedAt: 5_000 });

const view = { x: 0, z: 0, width: 840, height: 720, zoom: 1.4 } as never;
const player = { worldId, sessionKey: "fixture-session", dimension: "overworld", x: 260, y: 68, z: 120,
  receivedAt: 4_000, yaw: 0, expiresAt: Number.MAX_SAFE_INTEGER, facingExpiresAt: Number.MAX_SAFE_INTEGER };

export const Diagnostic = () => {
  const journey = useWorldJourney(worldId);
  return <main className="flex bg-background text-white" style={{ width: 1280, height: 720 }}>
    <section data-map className="relative h-full overflow-hidden bg-map-surface" style={{ width: 840 }}>
      <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px)", backgroundSize: "32px 32px" }} />
      <WorldJourneyLayer read={journey} dimension="overworld" view={view} />
      <div data-panel className="absolute bottom-3 left-3 top-3 z-30 w-[19rem] overflow-auto rounded-[var(--radius-lg)] border border-border bg-surface/95 p-4 shadow-[var(--panel-shadow)]">
        <WorldJourneySummary journey={journey} player={player} />
        <p className="mt-4 text-[11px] leading-4 text-zinc-300">Diagnostic map surface · 840px</p>
      </div>
      <output data-result className="absolute bottom-4 right-4 z-40 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-xs text-zinc-100">RUNNING</output>
    </section>
    <aside data-rail className="grid h-full place-items-center border-l border-border bg-surface text-sm text-zinc-300" style={{ width: 440 }}>Reserved ad rail · 440px</aside>
  </main>;
};

createRoot(document.getElementById("root")!).render(<Diagnostic />);

const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
void (async () => {
  await delay(250);
  const map = document.querySelector<HTMLElement>("[data-map]")!, panel = document.querySelector<HTMLElement>("[data-panel]")!;
  const rail = document.querySelector<HTMLElement>("[data-rail]")!, buttons = [...panel.querySelectorAll<HTMLButtonElement>("button")];
  if (!document.querySelector('svg[role="img"] polyline') || !document.querySelector('svg[role="img"] circle')) throw new Error("Journey path is not rendered");
  if (buttons.length !== 3 || panel.getBoundingClientRect().right > map.getBoundingClientRect().right || rail.getBoundingClientRect().left !== 840)
    throw new Error("Journey controls crossed the usable map surface");
  buttons[1].click(); await delay(100);
  if (document.querySelector('svg[role="img"]')) throw new Error("Hidden journey remained visible");
  panel.querySelectorAll<HTMLButtonElement>("button")[1].click(); await delay(100);
  if (!document.querySelector('svg[role="img"] polyline')) throw new Error("Journey did not return after Show");
  document.querySelector<HTMLOutputElement>("[data-result]")!.value = "PASS · route, controls, hide/show, 440px rail";
})().catch(error => {
  console.error(error); document.querySelector<HTMLOutputElement>("[data-result]")!.value = `FAIL · ${String(error)}`;
});

window.addEventListener("beforeunload", () => storage.remove(worldId));
