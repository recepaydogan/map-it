import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import i18n from "../src/i18n";
import "./inspector-check.css";
import { GAME_BIOME_PREVIEWS, GAME_EDITIONS, GAME_MAP_DIMENSIONS, GAME_STRUCTURE_TYPES } from "../src/game-config";
import { createGameSession } from "../src/features/game-session/session-types";
import { confirmSessionWorld } from "../src/features/worlds/world-session-binding";
import { resolveWorldMapPlayer, type WorldMapPlayer } from "../src/features/worlds/world-map-player";
import { emptyPersonalState, type WorldMapSurface, type WorldRecord } from "../src/features/worlds/world-types";
import WorldBiomeMap from "../src/features/worlds/world-biome-map";
import type { BiomeCamera } from "../src/features/generation/biome-viewport";
import type { StructureFilterState } from "../src/features/worlds/world-structure-filter-state";
import type { WorldPersonalState } from "../src/features/worlds/world-types";
import { getBrowserJourneyStorage } from "../src/features/journey/journey-storage";

// Actual React/canvas/packaged-worker path with synthetic player data and temporary journey records removed after each run.
// Hidden embedded tabs can indefinitely suspend native RAF; this diagnostic keeps renderer scheduling deterministic.
const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 0);
window.cancelAnimationFrame = handle => window.clearTimeout(handle);
window.addEventListener("pagehide", () => {
  window.requestAnimationFrame = nativeRequestAnimationFrame; window.cancelAnimationFrame = nativeCancelAnimationFrame;
}, { once: true });
const host = document.getElementById("root")!, map = document.createElement("main"), rail = document.createElement("aside");
host.style.cssText = "display:flex;width:1280px;height:880px";
map.style.cssText = "position:relative;flex:1;min-width:0;overflow:hidden";
rail.style.cssText = "width:440px;flex-shrink:0;padding:16px;overflow:auto;background:var(--color-background)";
const runButton = document.createElement("button"), report = document.createElement("pre"), notice = document.createElement("p");
runButton.textContent = i18n.t("inspector.runChecks"); runButton.style.cssText = "cursor:pointer;padding:12px;border:1px solid var(--color-border)";
notice.textContent = i18n.t("inspector.diagnosticNotice"); report.style.cssText = "white-space:pre-wrap;font-size:12px";
rail.append(notice, runButton, report); host.append(map, rail);
const root = createRoot(map), results: string[] = [];
const journeyStorage = getBrowserJourneyStorage();
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
// Embedded tabs may suspend RAF while the host window is occluded. Poll actual readiness below.
const tick = () => wait(50);
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const until = async (condition: () => boolean, description: string) => {
  const deadline = Date.now() + 25000;
  while (!condition()) { if (Date.now() > deadline) throw new Error(`Timed out: ${description}`); await wait(50); }
};
const marker = () => map.querySelector<HTMLElement>("[data-world-player]");
const button = (key: string) => {
  const item = [...map.querySelectorAll<HTMLButtonElement>("button")].find(item => item.getAttribute("aria-label") === i18n.t(key));
  if (!item) throw new Error(`Missing control: ${key}`); return item;
};
const note = (message: string) => { results.push(message); report.textContent = results.join("\n"); };
const biomeOnly = new URLSearchParams(window.location.search).has("biomeOnly");
let running = false;
const run = async () => {
  if (running) return; running = true; runButton.disabled = true; results.length = 0; report.textContent = "RUNNING";
  try {
    for (const edition of GAME_EDITIONS) {
      flushSync(() => root.render(null));
      const config = GAME_BIOME_PREVIEWS.find(item => item.edition === edition.id)!;
      const personal = emptyPersonalState();
      personal.pins = [{ id: "hotkey-pin", name: "Current position", dimension: GAME_MAP_DIMENSIONS[0].id,
        x: -504, y: 73, z: 800, icon: "pin", color: "amber", group: "current-position", note: "" }];
      personal.tracked = [{ id: "hotkey-target", label: "Current position", dimension: GAME_MAP_DIMENSIONS[0].id,
        x: -504, y: 73, z: 800, pointId: "hotkey-pin", kind: "player-pin" }];
      const world: WorldRecord = { schemaVersion: 1, id: `fixture-${edition.id}`, name: "Fixture world", edition: edition.id,
        generation: { version: config.versions[0], seed: "8675309", preset: "default", settings: {} }, personal,
        association: null, favorite: false, createdAt: 1, lastOpenedAt: 1, movedToBottomAt: null };
      journeyStorage.remove(world.id); journeyStorage.setVisible(world.id, true);
      const journeyRead = journeyStorage.read(world.id), journeyDimension = GAME_MAP_DIMENSIONS[1].id;
      journeyStorage.writeData({ ...journeyRead.data, journeys: [{ id: `fixture-route-${edition.id}`, worldId: world.id,
        sessionKey: `session-${edition.id}:1`, startedAt: 1, endedAt: 3, endReason: "session-ended", pendingBreak: false, truncated: false,
        segments: [{ dimension: journeyDimension, points: [
          { x: -820, y: 73, z: 792, at: 1 }, { x: -812, y: 73, z: 800, at: 2 }, { x: -804, y: 73, z: 808, at: 3 },
        ] }], }], updatedAt: 3 });
      let session = { ...createGameSession(`session-${edition.id}`, edition.gameClassId, edition.id), registered: true, inWorld: true,
        dimension: GAME_MAP_DIMENSIONS[0].id, yaw: 0, facingReceivedAt: Date.now(),
        position: { x: -512, y: 73, z: 800, receivedAt: Date.now(), sequence: 1 } };
      const binding = confirmSessionWorld(world, session, Date.now());
      const bound = () => resolveWorldMapPlayer(world, { session, error: null }, binding, Date.now(), 120000, GAME_MAP_DIMENSIONS.map(item => item.id), 30000000);
      let player: WorldMapPlayer | null = bound(), active = true, filterOpen = true;
      const saves: { worldId: string; dimension: string; surface: WorldMapSurface; camera: BiomeCamera }[] = [];
      const filterSaves: { worldId: string; dimension: string; filter: StructureFilterState }[] = [];
      let savedPersonal: WorldPersonalState = structuredClone(world.personal);
      const personalSaves: { worldId: string; personal: WorldPersonalState }[] = [];
      const save = async (worldId: string, dimension: string, surface: WorldMapSurface, camera: BiomeCamera) => {
        saves.push({ worldId, dimension, surface, camera });
      };
      const saveFilter = async (worldId: string, dimension: string, filter: StructureFilterState) => { filterSaves.push({ worldId, dimension, filter: structuredClone(filter) }); };
      const savePersonal = async (worldId: string, change: (personal: WorldPersonalState) => WorldPersonalState) => {
        savedPersonal = change(savedPersonal); world.personal = structuredClone(savedPersonal);
        personalSaves.push({ worldId, personal: structuredClone(savedPersonal) }); return structuredClone(savedPersonal);
      };
      const draw = async () => { flushSync(() => root.render(<WorldBiomeMap key={world.id} world={world} config={config} active={active} player={player}
        filterOpen={filterOpen} onFilterOpenChange={setOpen}
        saveCamera={save} saveFilter={saveFilter} savePersonal={savePersonal} />)); await tick(); };
      function setOpen(open: boolean) { filterOpen = open; void draw(); }
      await draw();
      await until(() => !!marker(), "initial player marker");
      assert(marker()!.querySelector("path")?.getAttribute("transform") === "rotate(0 16 16)", "South-facing SVG");
      assert(button("mapPlayer.follow").getAttribute("aria-pressed") === "false", "Follow is explicit, not automatic");
      button("mapPlayer.follow").click(); await tick();
      const centered = () => !!marker() && Math.abs(Number.parseFloat(marker()!.style.left) - map.clientWidth / 2) < 1 && Math.abs(Number.parseFloat(marker()!.style.top) - map.clientHeight / 2) < 1;
      assert(centered(), "Recenter aligns negative world coordinates");
      await until(() => [...map.querySelectorAll('[role="status"]')].some(item => item.textContent === i18n.t("biomeMap.ready")), "actual biome tiles ready");
      assert(map.querySelector('[data-map-destination][data-destination-type="player-pin"]'),
        "A current-position hotkey pin has its own 2D marker identity");
      const details = () => map.querySelector<HTMLElement>("[data-inspector-entry]");
      const biomeLegend = map.querySelector<HTMLElement>("[data-biome-legend]");
      assert(biomeLegend, "Loaded 2D tiles publish a compact named-biome legend inside the ER filter");
      biomeLegend!.querySelector<HTMLButtonElement>("button")!.click(); await tick();
      assert(biomeLegend!.querySelectorAll("[style*='background-color']").length > 0
        && !biomeLegend!.textContent?.includes(i18n.t("biomeMap.unknownBiome", { id: 65535 })),
      "Visible pinned-engine biome identities have named, colored legend rows");
      const biomeCanvas = map.querySelector<HTMLCanvasElement>(`canvas[aria-label="${i18n.t("biomeMap.canvas")}"]`)!;
      biomeCanvas.focus();
      biomeCanvas.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await until(() => !!details()?.querySelector("[data-biome-detail]"), "keyboard biome inspector");
      const biomeDetailText = details()?.textContent ?? "";
      assert(biomeDetailText.includes(i18n.t("inspector.subjectKinds.biome"))
        && biomeDetailText.includes(i18n.t("biomeMap.sampleCoordinates", { x: -512, y: 64, z: 800 }))
        && biomeDetailText.includes("minecraft:"),
      `Biome inspection opens the shared ER inspector with name, exact sample coordinate and reviewed registry identity: ${biomeDetailText}`);
      details()!.querySelector<HTMLButtonElement>('[data-inspector-focus="back"]')!.click(); await tick();
      assert(!details(), "Biome detail Back returns to the same filter base");
      note(`${edition.id}: visible biome legend and keyboard inspection share the ER panel history; pointer inspection is covered by the canvas contract tests`);
      if (biomeOnly) {
        flushSync(() => root.render(<WorldBiomeMap key={`hotkey-minimap-${world.id}`} world={world} config={config} active player={player}
          minimapMode followLivePosition onToggleFollowLivePosition={() => {}} zoomCommand={null}
          saveCamera={save} saveFilter={saveFilter} savePersonal={savePersonal} />));
        const minimapCanvas = () => map.querySelector<HTMLCanvasElement>(`canvas[aria-label="${i18n.t("biomeMap.canvas")}"]`);
        await until(() => Number(minimapCanvas()?.dataset.mapZoom) > 0, "minimap camera ready for hotkey zoom");
        const initialZoom = Number(minimapCanvas()!.dataset.mapZoom);
        flushSync(() => root.render(<WorldBiomeMap key={`hotkey-minimap-${world.id}`} world={world} config={config} active player={player}
          minimapMode followLivePosition onToggleFollowLivePosition={() => {}}
          zoomCommand={{ type: "zoom", direction: "in", revision: 1 }}
          saveCamera={save} saveFilter={saveFilter} savePersonal={savePersonal} />));
        await until(() => Number(minimapCanvas()?.dataset.mapZoom) > initialZoom, "generated minimap hotkey zoom");
        assert(map.querySelector('[data-map-destination][data-destination-type="player-pin"]'),
          "Current-position pin remains visible on the generated minimap");
        note(`${edition.id}: generated minimap command zoom and current-position marker passed`);
        journeyStorage.remove(world.id); flushSync(() => root.render(null)); continue;
      }
      const originalAnchorClick = HTMLAnchorElement.prototype.click;
      let snapshotDownload = "";
      HTMLAnchorElement.prototype.click = function () { snapshotDownload = this.download; };
      try {
        button("mapSnapshot.action").click();
        await until(() => map.textContent?.includes(i18n.t("mapSnapshot.saved")) ?? false, "snapshot composed");
      } finally { HTMLAnchorElement.prototype.click = originalAnchorClick; }
      assert(snapshotDownload.endsWith(".png") && snapshotDownload.includes(`x-512-z800`), "Snapshot download has map-context filename without writing during diagnostics");
      note(`${edition.id}: real WASM tiles ready; marker and explicit follow aligned`);
      await until(() => map.querySelector('[data-structure-status="ready"]') !== null, "actual structure queries ready");
      assert(new Set([...map.querySelectorAll<HTMLElement>('[data-structure-filter="expanded"] [data-map-sprite-source="/poi-artwork/structure-groups-v1.png"]')]
        .map(item => item.dataset.mapSprite)).size === 6, "ER filter exposes all six original illustrated structure groups");
      const filterText = map.querySelector('[data-structure-filter="expanded"]')?.textContent ?? "";
      assert(!filterText.includes(i18n.t("structureMap.filters.scope")) && !/\b\d+\s*\/\s*\d+\b/.test(filterText),
        "Filter copy omits loaded-count explanations and category fractions");
      const candidate = map.querySelector<HTMLButtonElement>("[data-structure-point]");
      assert(candidate, "Real source supplies visible candidates");
      const [type, candidateX, candidateZ] = JSON.parse(candidate!.dataset.structurePoint!);
      const typeArtwork = GAME_STRUCTURE_TYPES.find(item => item.id === type)!.artwork;
      const artworkSelector = `img[src="${typeArtwork}"]`;
      assert(candidate!.querySelector(artworkSelector), "Map candidate uses its individual illustrated artwork");
      const cameraBefore = map.querySelector("canvas")!.getBoundingClientRect();
      candidate!.click(); await tick();
      assert(details()?.textContent?.includes(i18n.t(`structureMap.types.${type}`)), "Correct structure identity in shared inspector");
      assert(details()?.querySelector(`header ${artworkSelector}`), "POI inspector retains the same individual illustrated identity");
      assert(details()?.textContent?.includes(i18n.t("structureMap.coordinates", { x: candidateX, z: candidateZ })), "Actual candidate X/Z and explicitly unknown altitude");
      assert(details()?.textContent?.includes(i18n.t(`structureMap.descriptions.${type}`)), "Concise structure description is shown");
      details()!.querySelector<HTMLButtonElement>('[data-inspector-focus="found"]')!.click();
      await until(() => details()!.querySelector('[data-inspector-focus="found"]')?.getAttribute("aria-pressed") === "true", "found state saved");
      details()!.querySelector<HTMLButtonElement>('[data-inspector-focus="favorite"]')!.click();
      await until(() => details()!.querySelector('[data-inspector-focus="favorite"]')?.getAttribute("aria-pressed") === "true", "favorite state saved");
      details()!.querySelector<HTMLButtonElement>('[data-inspector-focus="track"]')!.click();
      await until(() => details()!.querySelector('[data-inspector-focus="track"]')?.getAttribute("aria-pressed") === "true", "destination saved");
      const destination = map.querySelector<HTMLElement>("[data-map-destination]");
      assert(destination && ["visible", "edge"].includes(destination.dataset.destinationKind!), "Tracked target has a visible or edge map marker");
      const noteInput = details()!.querySelector<HTMLTextAreaElement>("textarea")!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(noteInput, "Meet here");
      noteInput.dispatchEvent(new Event("input", { bubbles: true })); await tick();
      details()!.querySelector<HTMLButtonElement>('[data-inspector-focus="save-note"]')!.click();
      await until(() => savedPersonal.notes[JSON.stringify([GAME_MAP_DIMENSIONS[0].id, candidate!.dataset.structurePoint!])] === "Meet here", "point note saved");
      assert(personalSaves.every(item => item.worldId === world.id) && savedPersonal.found.length === 1 && savedPersonal.favorites.length === 1 && savedPersonal.tracked.length === 2,
        "Personal actions remain under the exact selected world");
      assert(centered(), "Opening candidate details does not steal camera");
      assert(!map.querySelector('[data-structure-filter]'), "Opening a marker closes the filter panel");
      assert(details()!.getBoundingClientRect().right <= rail.getBoundingClientRect().left, "Inspector stays outside the 440px rail");
      host.style.width = "1040px"; await tick();
      assert(!map.querySelector("[data-structure-filter]") && details(), "Narrow view keeps the focused detail without reopening filters");
      assert(details()!.getBoundingClientRect().right <= rail.getBoundingClientRect().left, "Narrow inspector stays inside usable map");
      host.style.width = "1280px"; await tick();
      assert(!map.querySelector("[data-structure-filter]") && details(), "Wide view does not reopen filters behind a marker detail");
      active = false; await draw(); assert(!details(), "Hidden view removes inspector surface");
      active = true; await draw(); assert(details()?.textContent?.includes(i18n.t(`structureMap.types.${type}`)), "Hidden view retains selected candidate");
      button("structureMap.center").click(); await tick();
      assert(button("mapPlayer.follow").getAttribute("aria-pressed") === "false", "Explicit point center suspends follow");
      const selectedMarker = map.querySelector<HTMLElement>('[data-structure-point][aria-pressed="true"]');
      assert(selectedMarker && Math.abs(Number.parseFloat(selectedMarker.style.left) - cameraBefore.width / 2) < 1 &&
        Math.abs(Number.parseFloat(selectedMarker.style.top) - cameraBefore.height / 2) < 1, "Selected marker projects to the exact camera center");
      map.querySelector<HTMLButtonElement>('[data-inspector-focus="back"]')!.click(); await tick();
      assert(!details() && document.activeElement === map.querySelector("canvas"), "Back returns to map and restores keyboard focus");
      filterOpen = true; await draw();
      assert(map.querySelector('[data-structure-filter="expanded"]'), "The filter can be reopened without losing map state");
      assert(map.querySelector("[data-destination-summary]")?.textContent?.includes(i18n.t(`structureMap.types.${type}`)), "Tracked target remains in the ER filter rail");
      const search = map.querySelector<HTMLInputElement>(`input[aria-label="${i18n.t("structureMap.filters.search")}"]`)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "portal");
      search.dispatchEvent(new Event("input", { bubbles: true })); await wait(400);
      assert(filterSaves.at(-1)?.worldId === world.id && filterSaves.at(-1)?.dimension === GAME_MAP_DIMENSIONS[0].id && filterSaves.at(-1)?.filter.search === "portal", "Search persists under exact world and dimension");
      button("structureMap.filters.hideAll").click(); await tick();
      await until(() => map.querySelector('[data-structure-status="ready"][data-structure-total="0"]') !== null, "empty category query ready");
      assert(!map.querySelector("[data-structure-point], [data-structure-cluster]"), "Hide all removes structure markers and query work");
      button("structureMap.filters.showAll").click(); await tick();
      await until(() => map.querySelector("[data-structure-point], [data-structure-cluster]") !== null, "cached categories restored");
      filterOpen = false; await draw(); assert(!map.querySelector('[data-structure-filter]'), "Filter panel closes completely while its external trigger remains available");
      filterOpen = true; await draw(); assert(map.querySelector('[data-structure-filter="expanded"]'), "Filter panel reopens without losing state");
      button("mapPlayer.follow").click(); await tick();
      note(`${edition.id}: filters, persistence, responsive details, candidates, provenance, projection and Back passed`);
      session = { ...session, yaw: 90, facingReceivedAt: Date.now(), position: { ...session.position, x: -812, receivedAt: Date.now() } };
      player = bound(); await draw(); assert(centered(), "Follow updates center");
      assert(marker()!.querySelector("path")?.getAttribute("transform") === "rotate(90 16 16)", "West-facing SVG");
      map.querySelector("canvas")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })); await tick();
      assert(button("mapPlayer.follow").getAttribute("aria-pressed") === "false", "Keyboard exploration releases camera ownership");
      player = { ...player!, x: player!.x - 40 }; await draw(); assert(!centered(), "New position does not steal paused camera");
      button("mapPlayer.follow").click(); await tick(); assert(centered(), "Explicit recenter resumes");
      const input = map.querySelector<HTMLInputElement>('input[type="number"]')!; assert(input.value === "64", "Player altitude does not change biome sampling altitude");
      note(`${edition.id}: heading, movement, keyboard pause/recenter and independent sample Y passed`);
      player = { ...player!, dimension: GAME_MAP_DIMENSIONS[1].id, x: 20, z: -80 }; await draw();
      await until(() => !!marker() && marker()!.dataset.playerDimension === GAME_MAP_DIMENSIONS[1].id, "follow dimension switch");
      assert(centered(), "New dimension follows only after matching surface initialization");
      assert(!map.querySelector("[data-map-destination]") && !map.querySelector("[data-portal-ghost]"),
        "Wrong-dimension target remains listed but never becomes a false map position before an explicit projection");
      const portalPreviewLabel = i18n.t("structureMap.portalPlan.preview", {
        name: i18n.t(`structureMap.types.${type}`), dimension: i18n.t(GAME_MAP_DIMENSIONS[0].labelKey),
      });
      const portalPreview = [...map.querySelectorAll<HTMLButtonElement>("[data-destination-summary] button")]
        .find(item => item.getAttribute("aria-label") === portalPreviewLabel);
      assert(portalPreview && !portalPreview.disabled, "Linked-dimension destination offers an explicit portal projection");
      portalPreview!.click(); await tick();
      assert(map.querySelector("[data-portal-projection]") && map.querySelector("[data-portal-ghost]"),
        "Portal projection opens in the ER rail and draws a visually distinct ghost marker");
      const savePortal = [...map.querySelectorAll<HTMLButtonElement>("[data-portal-projection] button")]
        .find(item => item.textContent?.includes(i18n.t("structureMap.portalPlan.save")));
      assert(savePortal && !savePortal.disabled, "Portal projection can become a saved plan");
      savePortal!.click();
      await until(() => savedPersonal.pins.some(pin => pin.group === "portal-plans"), "portal plan persisted");
      await until(() => !map.querySelector("[data-portal-ghost]"), "temporary portal ghost cleared after save");
      assert(savedPersonal.tracked.some(target => target.kind === "portal-plan" && target.y === null)
        && map.querySelector('[data-map-destination][data-destination-type="portal-plan"]'),
        "Saved portal plan remains Y-unknown and replaces the temporary ghost");
      note(`${edition.id}: explicit cross-dimension ghost and removable pin-backed portal plan passed`);
      player = null; await draw(); assert(!marker(), "Missing location removes marker");
      assert(button("mapPlayer.follow").disabled, "No recenter without fresh location");
      assert(map.textContent?.includes(i18n.t(GAME_MAP_DIMENSIONS[1].labelKey)), "Last dimension retained while stale");
      player = { ...bound()!, dimension: GAME_MAP_DIMENSIONS[1].id, expiresAt: Date.now() + 120000, facingExpiresAt: null, yaw: null }; await draw();
      assert(marker() && !marker()!.querySelector("path"), "Unknown facing is a nondirectional dot");
      player = { ...player, expiresAt: Date.now() + 150 }; await draw();
      await wait(250); assert(!marker(), "Expiration timer removes marker without a telemetry event");
      note(`${edition.id}: dimension, missing-data, unknown-heading and timed-expiry checks passed`);
      player = { ...bound()!, dimension: GAME_MAP_DIMENSIONS[1].id }; await draw();
      active = false; await draw(); assert(!marker(), "Hidden map removes player overlay");
      active = true; await draw(); await until(() => !!marker(), "reactivated view");
      player = { ...player!, worldId: "unrelated-world" }; await draw(); assert(!marker(), "Foreign world cannot draw marker");
      player = { ...bound()!, sessionKey: "new-confirmation", dimension: GAME_MAP_DIMENSIONS[1].id }; await draw();
      assert(button("mapPlayer.follow").getAttribute("aria-pressed") === "false", "New confirmation does not inherit follow");
      const edge = rail.getBoundingClientRect().left;
      for (const control of map.querySelectorAll<HTMLElement>("button,input")) assert(control.getBoundingClientRect().right <= edge,
        `Control intrudes into rail: ${control.getAttribute("aria-label") ?? control.textContent}`);
      await wait(550); assert(saves.length > 0 && saves.every(item => item.worldId === world.id && item.surface === "desktop"),
        "Camera persists under the correct world and full-map surface");
      note(`${edition.id}: visibility, foreign-world rejection, reconfirmation, persistence and 440px rail passed`);
      assert(![...map.querySelectorAll("button")].some(item => item.textContent?.includes("3D")),
        "The generated-world workspace exposes only the 2D map");
      note(`${edition.id}: obsolete 3D controls and saved-terrain workspace are absent`);
      await wait(550); // Let the restored full-map camera finish its own debounced persistence before measuring minimap isolation.
      const saveCount = saves.length;
      player = { ...bound()!, dimension: GAME_MAP_DIMENSIONS[0].id };
      flushSync(() => root.render(<WorldBiomeMap key={`minimap-${world.id}`} world={world} config={config} active player={player}
        minimapMode followLivePosition onToggleFollowLivePosition={() => {}} saveCamera={save} saveFilter={saveFilter} savePersonal={savePersonal} />));
      await until(() => !!marker() && centered(), "minimap follows the validated player");
      await until(() => map.querySelector("[data-map-destination]") !== null, "minimap tracked destination");
      assert(!map.querySelector("[data-structure-filter], [data-inspector-entry], [data-structure-point], [data-structure-cluster]"),
        "Minimap omits the full filter, inspector and source-candidate hierarchy");
      assert(button("mapPlayer.pause").getAttribute("aria-pressed") === "true" && button("biomeMap.zoomIn") && button("biomeMap.zoomOut"),
        "Minimap retains follow and zoom controls");
      assert(map.querySelector("[data-biome-zoom-level]")?.textContent === "200%", "Minimap exposes its live zoom percentage");
      await wait(550); assert(saves.length === saveCount, "Minimap camera remains independent from the main 2D camera record");
      note(`${edition.id}: generated-world minimap follow, target, compact controls and camera isolation passed`);
      journeyStorage.remove(world.id);
    }
    note(biomeOnly ? "PASS: both edition biome inspection fixtures." : "PASS: both edition fixtures. Synthetic telemetry only; no in-game GEP verification.");
  } catch (error) { report.textContent += `\nFAIL: ${error instanceof Error ? error.stack : String(error)}`; console.error(error); }
  finally {
    for (const edition of GAME_EDITIONS) journeyStorage.remove(`fixture-${edition.id}`);
    running = false; runButton.disabled = false;
  }
};
runButton.addEventListener("click", () => { void run(); });
if (new URLSearchParams(location.search).has("autorun")) await run();
