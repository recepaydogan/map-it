import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { rewriteModuleAccounts } from "./module-account-build.mjs";
const source = await fs.readFile(new URL("../public/map-it-account.js", import.meta.url), "utf8");
function harness(appId = "wow-forever", configured = true) {
  const calls = [], events = {};
  const window = { __MAP_IT_APP__: { id: appId }, __MAP_IT_SOLO_ACCOUNT_ORIGINS__: ["https://solo.supabase.co"], parent: { __MAP_IT_ACCOUNT_CONFIG__: { url: configured ? "https://mapit.supabase.co" : "", key: configured ? "new-key" : "", storageKey: "map-it-auth" }, postMessage(...args) { calls.push(args); } }, fetch: async (url, init) => { calls.push({ url, init }); return new Response("{}"); }, addEventListener() {} };
  const context = { window, location: { href: "http://local/apps/game/index.html", origin: "http://local", search: "" }, localStorage: { getItem() { return null; } }, document: { documentElement: {}, head: { appendChild() {} }, createElement() { return {}; }, querySelectorAll() { return []; }, addEventListener(name, callback) { events[name] = callback; }, removeEventListener() {} }, MutationObserver: class { observe() {} disconnect() {} }, URL, Request, Response, Headers };
  vm.runInNewContext(source, context);
  calls.length = 0;
  return { window, calls, events };
}
test("module auth uses Map It and replaces only the old anonymous authorization", async () => {
  const app = harness();
  await app.window.fetch("https://solo.supabase.co/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: "old-key", authorization: "Bearer old-key" }, body: "{}" });
  assert.equal(app.calls[0].url, "https://mapit.supabase.co/auth/v1/token?grant_type=password");
  assert.equal(app.calls[0].init.headers.get("apikey"), "new-key");
  assert.equal(app.calls[0].init.headers.get("authorization"), "Bearer new-key");
  await app.window.fetch("https://solo.supabase.co/auth/v1/user", { headers: { apikey: "old-key", authorization: "Bearer user-token" } });
  assert.equal(app.calls[1].init.headers.get("authorization"), "Bearer user-token");
});
test("games with identical solo table names stay isolated and keep query filters", async () => {
  for (const id of ["enshrouded", "wow-forever", "phantom-blade"]) {
    const app = harness(id); await app.window.fetch("https://solo.supabase.co/rest/v1/user_saved_state?user_id=eq.123");
    assert.equal(app.calls[0].url, `https://mapit.supabase.co/rest/v1/map_it_${id.replaceAll("-", "_")}_user_saved_state?user_id=eq.123`);
  }
});
test("game RPCs use namespaces and imported support pollers stay retired", async () => {
  const app = harness("minecraft");
  await app.window.fetch(new Request("https://solo.supabase.co/rest/v1/rpc/user_progress_save", { method: "POST", body: '{"p_state":{}}', headers: { authorization: "Bearer player" } }));
  assert.equal(app.calls[0].url.url, "https://mapit.supabase.co/rest/v1/rpc/map_it_minecraft_user_progress_save");
  assert.equal(await app.calls[0].url.text(), '{"p_state":{}}');
  const response = await app.window.fetch("https://solo.supabase.co/rest/v1/rpc/support_list_threads");
  assert.deepEqual(await response.json(), []);
  const blocked = await app.window.fetch("https://solo.supabase.co/rest/v1/rpc/support_start_thread");
  assert.equal(blocked.status, 409);
  assert.equal(app.calls.length, 1);
});
test("unconfigured Map It never sends a request to a solo account backend", async () => {
  const app = harness("valheim", false);
  const response = await app.window.fetch("https://solo.supabase.co/auth/v1/user");
  assert.equal(response.status, 503); assert.equal(app.calls.length, 0);
  await app.window.fetch("https://cdn.example/maps/tile.png"); assert.equal(app.calls.length, 1);
});
test("account buttons open the single parent account surface before React", () => {
  const app = harness(); let prevented = 0;
  const button = { hasAttribute: name => name === "data-map-it-account-trigger", closest: () => null };
  app.events.click({ target: { closest: () => button }, preventDefault() { prevented++; }, stopImmediatePropagation() { prevented++; } });
  assert.equal(prevented, 2); assert.equal(app.calls[0][0].type, "map-it:open-account");
});

test("support buttons and internal navigation open the host feedback surface", () => {
  const app = harness();
  const button = { hasAttribute: name => name === "data-map-it-support-trigger" };
  app.events.click({ target: { closest: () => button }, preventDefault() {}, stopImmediatePropagation() {} });
  assert.equal(app.calls[0][0].type, "map-it:open-support");
  const output = rewriteModuleAccounts("apps/valheim/assets/app.js", Buffer.from('function go(){setPage("support")}go();')).toString();
  let opened = 0;
  vm.runInNewContext(output, { window: { __MAP_IT_OPEN_SUPPORT__() { opened++; } }, setPage() { throw new Error("Solo support must not open"); } });
  assert.equal(opened, 1);
});
test("build rewrite shares auth keys, exposes only the original flush, and leaves executable code local", async () => {
  const original = 'const c={storageKey:`${game.appSlug}-auth`};const url="https://solo.supabase.co";async function leave(){const id="player";await flush(id);await client.auth.signOut()}';
  const output = rewriteModuleAccounts("apps/elden-ring/assets/main.js", Buffer.from(original)).toString();
  assert(output.includes('storageKey:"map-it-auth"')); assert(output.includes('flush(userId)'));
  assert(!output.includes("client.auth.signOut(userId)"));
  const calls = []; const context = { game: { appSlug: "old" }, flush: async id => { calls.push(id); return false; } };
  vm.runInNewContext(output, context);
  assert.equal(await context.__MAP_IT_FLUSH_ACCOUNT__("mapit-player"), false); assert.deepEqual(calls, ["mapit-player"]);
});
test("internal account navigation, including comment sign-in links, opens the host", () => {
  const output = rewriteModuleAccounts("apps/elden-ring/assets/app.js", Buffer.from('function go(){openOverlay("account")}go();')).toString();
  let opened = 0;
  vm.runInNewContext(output, { window: { __MAP_IT_OPEN_ACCOUNT__() { opened++; } }, openOverlay() { throw new Error("Solo account page must not open"); } });
  assert.equal(opened, 1);
});
test("profile-level save guards remain available to shared account sign-out", async () => {
  const code = 'async function leave(){try{if(!await save(user.id))return;await signOut()}catch(e){console.error("[Account] Unable to sign out safely:",e)}}';
  const output = rewriteModuleAccounts("apps/minecraft/assets/index.js", Buffer.from(code)).toString();
  const context = { save: async id => id === "account" };
  vm.runInNewContext(output, context);
  assert.equal(await context.__MAP_IT_FLUSH_ACCOUNT__("account"), true);
});

test("imported modules hide solo subscription surfaces and keep their controller and other actions", () => {
  const source = `
    const open = () => "opened";
    const controller = { premium: true, checkout: open };
    function Settings() { return { id: "subscription-settings-title" }; }
    function Plans() { return "premiumPlans.title"; }
    function Banner() { return "ads.goPremium"; }
    function render() {
      const adFree = true && controller.premium;
      const params = new URLSearchParams("previewPremium=1&preview=remove-ads");
      const preview = params.get("previewPremium") === "1" || params.get("preview") === "remove-ads";
      const onRemoveAds = open;
      return { adFree, preview, settings: Settings(), plans: Plans(), banner: Banner(),
        onRemoveAds, onOpenPackages: open, onOpenFeedback: open, controller };
    }
    render();
  `;
  const input = Buffer.from(source);
  assert.equal(rewriteModuleAccounts("assets/standalone.js", input), input);
  const output = rewriteModuleAccounts("apps/valheim/assets/main.js", input).toString();
  const hidden = vm.runInNewContext(output, { __MAP_IT_APP__: {}, URLSearchParams });
  assert.equal(hidden.settings, null);
  assert.equal(hidden.plans, null);
  assert.equal(hidden.banner, null);
  assert.equal(hidden.onRemoveAds, undefined);
  assert.equal(hidden.onOpenPackages, undefined);
  assert.equal(hidden.onOpenFeedback(), "opened");
  assert.equal(hidden.adFree, false);
  assert.equal(hidden.preview, false);
  assert.equal(hidden.controller.premium, true);
  assert.equal(hidden.controller.checkout(), "opened");
  const enabled = vm.runInNewContext(output, { __MAP_IT_APP__: { showSoloSubscriptionUi: true }, URLSearchParams });
  assert.equal(enabled.settings.id, "subscription-settings-title");
  assert.equal(enabled.plans, "premiumPlans.title");
  assert.equal(enabled.onRemoveAds(), "opened");
  assert.equal(enabled.preview, true);
  assert.equal(enabled.adFree, true);
});
