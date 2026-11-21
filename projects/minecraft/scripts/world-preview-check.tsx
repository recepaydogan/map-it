import { IDBFactory } from "fake-indexeddb";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import i18n from "../src/i18n";
import { WORLD_LIBRARY_CONFIG } from "../src/game-config";
import "./world-preview-check.css";

// The production repository module captures indexedDB at import time. Install a
// memory-only factory first so this diagnostic cannot touch the app library.
Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
const { default: WorldMapWorkspace } = await import("../src/features/worlds/world-map-workspace");
const { refreshWorldLibrary, runWorldCommand, worldRepository } = await import("../src/features/worlds/use-world-library");

const key = `${WORLD_LIBRARY_CONFIG.detachedPreviewKeyPrefix}:desktop`;
sessionStorage.removeItem(key);
const makeWorld = (name: string, seed: string) => ({
  name, edition: "java", generation: { version: "diagnostic-release", seed, preset: "default", settings: {} },
});
const linked = await worldRepository.create(makeWorld("Linked world", "1"));
const preview = await worldRepository.create(makeWorld("Preview world", "2"), { select: false });
const replacement = await worldRepository.create(makeWorld("New linked world", "3"), { select: false });
await refreshWorldLibrary();

const host = document.getElementById("root")!;
host.innerHTML = `<div class="preview-check-shell"><main class="preview-check-map"></main><aside class="preview-check-rail"><h1>Reserved advertising rail · 440px</h1><p>Runs the production world workspace against a memory-only library.</p><button type="button">Run detached preview checks</button><pre role="status">null</pre></aside></div>`;
const map = host.querySelector<HTMLElement>(".preview-check-map")!;
const rail = host.querySelector<HTMLElement>(".preview-check-rail")!;
const runButton = rail.querySelector<HTMLButtonElement>("button")!;
const report = rail.querySelector<HTMLElement>("pre")!;
const root = createRoot(map);
root.render(<WorldMapWorkspace active viewScope="desktop" />);

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const until = async (condition: () => boolean, description: string) => {
  const deadline = Date.now() + 15000;
  while (!condition()) { if (Date.now() > deadline) throw new Error(`Timed out: ${description}`); await wait(40); }
};
const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const buttonByLabel = (label: string) => [...map.querySelectorAll<HTMLButtonElement>("button")]
  .find(button => button.getAttribute("aria-label") === label);
let running = false;

const run = async () => {
  if (running) return; running = true; runButton.disabled = true; report.textContent = "RUNNING";
  const checks: string[] = [];
  try {
    await until(() => map.firstElementChild?.getAttribute("data-world-id") === linked.id, "linked world workspace");
    const initial = await worldRepository.snapshot(), edge = rail.getBoundingClientRect().left;
    assert(initial.selection.worldId === linked.id, "Fixture did not begin on the linked world");
    assert([...map.querySelectorAll("button")].some(button => button.textContent?.includes(i18n.t("liveSession.status.disconnected"))),
      "Linked mode did not expose the session control");
    const detach = buttonByLabel(i18n.t("worlds.preview.detachAction"));
    assert(detach && !detach.disabled, "Detached-preview control is unavailable for a selected world");
    for (const control of map.querySelectorAll<HTMLElement>("button,input"))
      assert(control.getBoundingClientRect().right <= edge, "A world-preview control crossed the 440px advertising rail");
    checks.push("Linked mode exposes session state and keeps controls outside the advertising rail");

    detach.click();
    await until(() => map.firstElementChild?.getAttribute("data-world-preview") === "detached", "detached mode");
    assert(map.textContent?.includes(i18n.t("worlds.preview.liveDisabled")), "Detached mode is not visibly disclosed");
    assert(![...map.querySelectorAll("button")].some(button => button.textContent?.includes(i18n.t("liveSession.status.disconnected"))),
      "Detached mode retained the live-session control");
    checks.push("Detached mode is explicit and removes the live-session binding surface");

    buttonByLabel(i18n.t("worlds.title"))!.click();
    await wait(80);
    const previewChoice = [...map.querySelectorAll<HTMLButtonElement>("#world-selector-panel li > button:first-child")]
      .find(button => button.textContent?.includes(preview.name));
    assert(previewChoice, "Preview world is absent from the production selector"); previewChoice.click();
    await until(() => map.firstElementChild?.getAttribute("data-world-id") === preview.id, "local preview selection");
    const afterPreview = await worldRepository.snapshot();
    assert(afterPreview.selection.worldId === linked.id && afterPreview.selection.revision === initial.selection.revision,
      "Detached selection mutated the shared selected world");
    assert((await worldRepository.get(preview.id)).lastOpenedAt === preview.lastOpenedAt,
      "Detached selection changed shared recency");
    map.style.width = "560px"; await wait(80);
    const narrowEdge = rail.getBoundingClientRect().left;
    for (const control of map.querySelectorAll<HTMLElement>("button,input"))
      assert(control.getBoundingClientRect().right <= narrowEdge, "A narrow detached-preview control crossed the advertising rail");
    map.style.width = "840px"; await wait(80);
    checks.push("Selecting another world changes only this window and preserves shared selection/recency");

    await runWorldCommand(() => worldRepository.select(replacement.id));
    await until(() => map.firstElementChild?.getAttribute("data-world-id") === preview.id, "detached view after linked selection change");
    assert((await worldRepository.snapshot()).selection.worldId === replacement.id,
      "Shared selection change did not commit behind the detached preview");
    const attach = buttonByLabel(i18n.t("worlds.preview.attachAction"));
    assert(attach, "Return-to-linked action is missing"); attach.click();
    await until(() => map.firstElementChild?.getAttribute("data-world-id") === replacement.id
      && map.firstElementChild?.getAttribute("data-world-preview") === "linked", "return to linked world");
    assert(sessionStorage.getItem(key) === null, "Returning to linked mode retained detached session state");
    checks.push("A linked-world change cannot contaminate the preview; reconnect adopts it explicitly");

    report.textContent = JSON.stringify({ status: "PASS", checks,
      scope: "Production workspace and selector; memory-only IndexedDB; sessionStorage preview state; no app database or game-save access" }, null, 2);
  } catch (error) {
    report.textContent = JSON.stringify({ status: "FAIL", error: error instanceof Error ? error.stack : String(error) }, null, 2);
  } finally { running = false; runButton.disabled = false; }
};

runButton.addEventListener("click", () => { void run(); });
window.addEventListener("pagehide", () => { sessionStorage.removeItem(key); worldRepository.close(); }, { once: true });
if (new URLSearchParams(location.search).has("autorun")) await run();
