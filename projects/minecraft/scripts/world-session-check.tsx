import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import i18n from "../src/i18n";
import "./inspector-check.css";
import { GAME_EDITIONS, GAME_TELEMETRY } from "../src/game-config";
import { createGameSession } from "../src/features/game-session/session-types";
import type { SessionRead } from "../src/features/game-session/session-storage";
import WorldSessionControl from "../src/features/worlds/world-session-control";
import { createWorldRepository } from "../src/features/worlds/world-repository";
import { resolveBoundSession } from "../src/features/worlds/world-session-binding";
import { createRuntimeId } from "../src/lib/runtime-id";

// Isolated native-browser fixtures; never publish fake telemetry or access the app's database.
const host = document.getElementById("root")!;
const surface = document.createElement("div"), map = document.createElement("main"), rail = document.createElement("aside");
surface.style.cssText = "display:flex;width:1280px;max-width:none;height:880px";
map.style.cssText = "position:relative;flex:1;min-width:0;container-type:inline-size;overflow:hidden";
rail.style.cssText = "width:440px;flex-shrink:0;padding:16px;background:var(--color-background);overflow:auto";
const runButton = document.createElement("button"), report = document.createElement("pre");
runButton.textContent = i18n.t("inspector.runChecks");
runButton.style.cssText = "cursor:pointer;padding:12px;border:1px solid var(--color-border);border-radius:var(--radius-md)";
report.style.cssText = "white-space:pre-wrap;font-size:12px";
const notice = document.createElement("p");
notice.textContent = i18n.t("inspector.diagnosticNotice");
rail.append(notice, runButton, report); surface.append(map, rail); host.append(surface);
const root = createRoot(map);
const tick = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const button = (label: string) => {
  const result = [...map.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === label || item.getAttribute("aria-label") === label);
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
};
const checks: string[] = [];
let running = false;

const run = async () => {
  if (running) return;
  running = true; runButton.disabled = true; checks.length = 0; report.textContent = "RUNNING";
  try {
    for (const edition of GAME_EDITIONS) {
      // Keep each run separate and retain the tiny database for inspection; never delete user data.
      const repo = createWorldRepository({ name: `session-diagnostic-${createRuntimeId()}`, factory: indexedDB });
      try {
        const world = await repo.create({ name: "Fixture world", edition: edition.id,
          generation: { version: "fixture-version", seed: "9223372036854775807", preset: "default", settings: {} } });
        let library = await repo.snapshot(), now = Date.now();
        const fresh = () => ({ ...createGameSession(`fixture-${edition.id}`, edition.gameClassId, edition.id), registered: true,
          inWorld: true, dimension: "surface", sequence: 1, identity: { worldName: "Fixture identity", server: null, realmId: null, realmName: null },
          position: { x: -12.5, y: 73, z: 800.25, receivedAt: Date.now(), sequence: 1 } });
        let read: SessionRead = { session: fresh(), error: null };
        now = Date.now();
        const draw = async () => {
          library = await repo.snapshot();
          const selected = library.worlds.find(item => item.id === library.selection.worldId) ?? null;
          flushSync(() => root.render(<div key={edition.id} style={{ position: "absolute", inset: "12px 12px auto", display: "flex", gap: 12 }}>
            <WorldSessionControl world={selected} library={library} read={read} now={now} active
              onBind={async (binding, revision, hint) => {
                if (read.error || resolveBoundSession(selected, read.session, binding, Date.now(), GAME_TELEMETRY.staleAfterMs).status !== "live")
                  throw new Error("Fixture session changed before confirmation.");
                await repo.bindSession(binding, revision, hint); await draw();
              }} onUnbind={async binding => { await repo.clearSessionBinding(binding); await draw(); }} />
          </div>));
          await tick();
        };
        const record = (message: string) => { checks.push(`${edition.id}: ${message}`); report.textContent = checks.join("\n"); };
        await draw();
        const trigger = map.querySelector<HTMLButtonElement>("button[aria-controls='world-session-panel']")!;
        if (trigger.getAttribute("aria-expanded") !== "true") { trigger.click(); await tick(); }
        assert(!map.querySelector("[data-bound-position]"), "Unconfirmed coordinates leaked");
        assert(button(i18n.t("liveSession.confirm")), "Confirmation missing");
        const panel = map.querySelector<HTMLElement>("#world-session-panel")!;
        const bounds = panel.getBoundingClientRect(), area = map.getBoundingClientRect();
        assert(bounds.left >= area.left + 11 && bounds.right <= area.right - 11, "Panel crossed map bounds/ad rail");
        record("unassociated position hidden; confirmation and rail-safe panel visible");

        const remember = map.querySelector<HTMLInputElement>("input[type=checkbox]")!;
        remember.click(); await tick();
        read = { session: fresh(), error: null }; now = Date.now(); await draw();
        button(i18n.t("liveSession.confirm")).click(); await tick(); await tick();
        assert(map.querySelector("[data-bound-position]")?.textContent?.includes("-12.50 / 73.00 / 800.25"), "Confirmed coordinates absent");
        assert((await repo.get(world.id)).association?.identity === "Fixture identity", "Remembered suggestion absent");
        record("confirmation stores association and shows exact X/Y/Z");

        now = read.session!.position!.receivedAt + GAME_TELEMETRY.staleAfterMs + 1; await draw();
        assert(!map.querySelector("[data-bound-position]"), "Stale position remained visible");
        assert(map.textContent?.includes(i18n.t("liveSession.message.stale")), "Stale explanation absent");
        record("stale position hidden with an explanation");

        read = { session: { ...fresh(), generation: 1 }, error: null }; now = Date.now(); await draw();
        assert(!map.querySelector("[data-bound-position]"), "New generation reused confirmation");
        assert(button(i18n.t("liveSession.confirm")), "New generation cannot be confirmed");
        record("new game-world generation requires confirmation again");

        const alternate = GAME_EDITIONS.find(item => item.id !== edition.id)!;
        await repo.create({ name: "Other edition", edition: alternate.id, generation: world.generation });
        await draw();
        assert(!map.querySelector("[data-bound-position]"), "Other edition received player coordinates");
        assert(!map.textContent?.includes(i18n.t("liveSession.confirmNotice")), "Cross-edition confirmation offered");
        assert(map.textContent?.includes(i18n.t("liveSession.editionMismatch")), "Edition warning absent");
        record("cross-edition world rejects association");

        await repo.select(world.id);
        read = { session: null, error: "invalid-session" }; await draw();
        assert(!map.querySelector("[data-bound-position]"), "Invalid session exposed coordinates");
        assert(map.textContent?.includes(i18n.t("liveSession.message.error")), "Invalid session explanation missing");
        record("synchronization error has a visible fail-closed state");

        read = { session: fresh(), error: null }; now = Date.now(); await draw();
        // The original confirmation still matches this fixture session. Unlink through the actual control.
        assert(map.querySelector("[data-bound-position]"), "Fresh matching session did not recover");
        button(i18n.t("liveSession.unlink")).click(); await tick(); await tick();
        assert((await repo.snapshot()).binding === null, "Unlink did not persist");
        assert(!map.querySelector("[data-bound-position]"), "Unlink left coordinates visible");
        assert((await repo.get(world.id)).association?.identity === "Fixture identity", "Unlink unexpectedly removed remembered hint");
        assert(button(i18n.t("liveSession.confirm")), "Reconfirmation not offered after unlink");
        record("unlink hides coordinates and preserves suggestion without automatic rebinding");

        surface.style.width = "760px"; await tick();
        const narrow = panel.getBoundingClientRect(), narrowMap = map.getBoundingClientRect();
        assert(narrow.width <= 296.5 && narrow.left >= narrowMap.left + 11 && narrow.right <= narrowMap.right - 11,
          "Narrow panel exceeded usable 320px map area");
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); await tick();
        assert(panel.hidden && document.activeElement === trigger, "Escape did not close and restore focus");
        surface.style.width = "1280px";
        record("320px map area clamps panel; Escape restores trigger focus");
      } finally { repo.close(); }
    }
    report.textContent = `PASS: ${checks.length} native browser checks\n${checks.join("\n")}`;
  } catch (error) {
    console.error("[Session diagnostic] Check failed", error);
    report.textContent = `FAIL: ${String(error)}\n${checks.join("\n")}`;
  } finally { running = false; runButton.disabled = false; }
};
runButton.addEventListener("click", () => { void run(); });
