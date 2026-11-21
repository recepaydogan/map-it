import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await fs.readFile(new URL("../public/map-it-runtime.js", import.meta.url), "utf8");
function storage() {
  const data = new Map();
  return { get length() { return data.size; }, key: i => [...data.keys()][i] ?? null, getItem: key => data.get(String(key)) ?? null, setItem: (key, value) => data.set(String(key), String(value)), removeItem: key => data.delete(String(key)), clear: () => data.clear() };
}
function harness(id, shared = storage(), content, document, accountFetch, native = {}) {
  const events = new Map(); const calls = []; const callbacks = new Set(); let stops = 0;
  class Element { setAttribute(name, value) { (this.attributes ??= {})[name] = value; } get innerHTML() { return this.html; } set innerHTML(value) { this.html = value; } }
  class Media extends Element {}
  class Image extends Media { get src() { return this.imageSource; } set src(value) { this.imageSource = value; } }
  class Xhr { open() {} }
  const messageEvent = { addListener: callback => callbacks.add(callback), removeListener: callback => callbacks.delete(callback) };
  const plugin = { stop() { stops++; } };
  const original = { windows: { getCurrentWindow(callback) { callback({ success: true, window: { id: "native-id", name: "mi_game_overlay" } }); }, obtainDeclaredWindow(name, callback) { calls.push(name); callback({ success: true, window: { name } }); }, sendMessage(...args) { calls.push(args.slice(0, 3)); }, onMessageReceived: messageEvent }, extensions: { current: { getExtraObject(_name, callback) { callback({ success: true, object: plugin }); }, getExtensionData(callback) { callback({ success: true, data: { path_on_disk: "C:\\MapIt" } }); } } } };
  const window = { __MAP_IT_APP__: { id, prefix: `/apps/${id}`, roots: ["data", "maps", "assets"], windows: { main: "main", background: "background", overlay: `mi_${id}_overlay` }, hotkeys: {}, manifest: { data: { game_targeting: { game_ids: [123] } } } }, localStorage: shared, sessionStorage: storage(), parent: { postMessage() {} }, overwolf: original, fetch: async (...args) => { calls.push(args); }, addEventListener(name, listener) { const list = events.get(name) || []; list.push(listener); events.set(name, list); }, dispatchEvent(event) { for (const listener of events.get(event.type) || []) listener(event); } };
  if (native.io) { original.io = native.io; window.__MAP_IT_APP__.roots.push("tracking-mod"); }
  if (native.hostWindows) window.parent.overwolf = { windows: native.hostWindows };
  if (native.lockedGlobal) Object.defineProperty(window, "overwolf", { value: original, configurable: false, writable: false });
  const context = { window, location: { href: `http://localhost/apps/${id}/index.html?window=overlay`, search: "?window=overlay", origin: "http://localhost" }, URL, URLSearchParams, Request, XMLHttpRequest: Xhr, Element, HTMLImageElement: Image, HTMLScriptElement: class extends Media {}, HTMLLinkElement: class extends Media {}, HTMLMediaElement: Media, HTMLSourceElement: class extends Media {}, StorageEvent: class { constructor(type, properties) { this.type = type; Object.assign(this, properties); } } };
  if (content) window.__MAP_IT_CONTENT__ = content;
  if (accountFetch) window.__MAP_IT_ACCOUNT_FETCH__ = accountFetch;
  if (document) context.document = document;
  vm.runInNewContext(source, context);
  return { window, Element, Image: context.HTMLImageElement, calls, callbacks, emit: payload => callbacks.forEach(listener => listener(payload)), stops: () => stops, shared };
}

test("identical legacy save keys and clear() remain isolated between games", () => {
  const shared = storage(); shared.setItem("map-it:selected-app", "aion-2");
  const a = harness("aion-2", shared); const b = harness("wow-forever", shared);
  a.window.localStorage.setItem("gm:markers", "Aion markers");
  b.window.localStorage.setItem("gm:markers", "WoW markers");
  assert.equal(a.window.localStorage.getItem("gm:markers"), "Aion markers");
  assert.equal(b.window.localStorage.getItem("gm:markers"), "WoW markers");
  a.window.localStorage.clear();
  assert.equal(b.window.localStorage.getItem("gm:markers"), "WoW markers");
  assert.equal(shared.getItem("map-it:selected-app"), "aion-2");
});
test("only Map It auth is shared; clearing one game's data preserves the session", () => {
  const shared = storage(); const a = harness("aion-2", shared); const b = harness("wow-forever", shared);
  a.window.localStorage.setItem("map-it-auth", "shared session");
  a.window.localStorage.setItem("game-maps-auth", "legacy solo session");
  assert.equal(b.window.localStorage.getItem("map-it-auth"), "shared session");
  assert.equal(b.window.localStorage.getItem("game-maps-auth"), null);
  a.window.localStorage.clear(); assert.equal(b.window.localStorage.getItem("map-it-auth"), "shared session");
});

test("native hotkey reads keep assigned bindings scoped to the selected game", async () => {
  const app = harness("valheim");
  app.window.__MAP_IT_APP__.hotkeys = { toggle_overlay: "native_overlay" };
  app.window.__MAP_IT_APP__.manifest.data.game_targeting.game_ids = [21668];
  app.window.__MAP_IT_APP__.manifest.data.hotkeys = { toggle_overlay: { default: "Ctrl+Alt+V" } };
  vm.runInNewContext(await fs.readFile(new URL("../public/map-it-hotkeys.js", import.meta.url), "utf8"), { window: app.window, console });
  app.window.overwolf.settings = { hotkeys: {
    get(callback) { callback({ success: true, globals: [], games: { 21668: [{ name: "native_overlay", binding: "Ctrl+Alt+V", IsUnassigned: false }], 765: [{ name: "native_overlay", binding: "", IsUnassigned: true }] } }); },
    assign() { throw new Error("An assigned hotkey must be preserved"); },
  } };
  const result = await new Promise(resolve => app.window.overwolf.settings.hotkeys.get(resolve));
  assert.equal(result.games[21668][0].name, "toggle_overlay");
  assert.equal(result.games[21668][0].binding, "Ctrl+Alt+V");
  assert.equal(result.games[21668][0].IsUnassigned, false);
  assert.equal(result.games[765], undefined);
});
test("root-relative local fetches are scoped while CDN requests retain their URLs", async () => {
  const app = harness("minecraft");
  await app.window.fetch("/data/catalog.json");
  await app.window.fetch("https://cdn.example.com/maps/tile.webp");
  assert.equal(app.calls[0][0], "http://localhost/apps/minecraft/data/catalog.json");
  assert.equal(app.calls[1][0], "https://cdn.example.com/maps/tile.webp");
});

test("the content loader remains outside account routing so asset retries and disk cache stay active", async () => {
  const calls = [];
  const content = { resolveAsset: value => value, fetchContent: async (url, init) => { calls.push({ url, init }); } };
  const app = harness("minecraft", storage(), content, undefined, () => { throw new Error("The host must enter through content routing"); });
  await app.window.fetch("/data/catalog.json");
  assert.equal(calls[0].url, "http://localhost/apps/minecraft/data/catalog.json");
  assert.equal(app.calls.length, 0);
});

test("CDN helpers cannot embed this game's imported local scope in immutable asset URLs", async () => {
  const app = harness("valheim");
  app.window.__MAP_IT_CONTENT_CONFIG__ = { aliases: [{ origin: "https://pz.ingredientassets.com" }] };
  const base = "https://pz.ingredientassets.com/valheim/assets/b5f5cc0bca9e2877695b";
  const icon = "game-data/icons/mapicon-boss-0aa12f0d.png";
  await app.window.fetch(`${base}/apps/valheim/${icon}?v=1#preview`);
  assert.equal(app.calls[0][0], `${base}/${icon}?v=1#preview`);
  const image = new app.Element();
  image.innerHTML = `<img src="${base}/apps/valheim/${icon}">`;
  assert.equal(image.innerHTML, `<img src="${base}/${icon}">`);
  const reactImage = new app.Image();
  reactImage.setAttribute("src", `${base}/apps/valheim/${icon}`);
  assert.equal(reactImage.attributes.src, `${base}/${icon}`);
  reactImage.src = `${base}/apps/valheim/${icon}`;
  assert.equal(reactImage.src, `${base}/${icon}`);
  for (const url of [ `${base}/${icon}`, `${base}/apps/minecraft/${icon}`, `https://other.example/assets/b5f5cc0bca9e2877695b/apps/valheim/${icon}`, `https://pz.ingredientassets.com/unversioned/apps/valheim/${icon}` ]) {
    await app.window.fetch(url);
    assert.equal(app.calls.at(-1)[0], url);
  }
});
test("native aliases and current-window identity preserve an imported overlay", () => {
  const app = harness("valheim");
  app.window.overwolf.windows.obtainDeclaredWindow("overlay", result => assert.equal(result.window.name, "overlay"));
  assert.equal(app.calls[0], "mi_valheim_overlay");
  app.window.overwolf.windows.getCurrentWindow(result => { assert.equal(result.window.id, "native-id"); assert.equal(result.window.name, "overlay"); });
});
test("native filesystem methods remain callable with their original receiver", () => {
  const app = harness("valheim");
  const io = Object.freeze({
    readBinaryFile(path, options, callback) {
      assert.equal(this, io);
      assert.equal(path, "world.fwl");
      assert.equal(options.offset, 0);
      callback({ success: true });
    },
  });
  app.window.overwolf.io = io;
  let result;
  app.window.overwolf.io.readBinaryFile("world.fwl", { offset: 0 }, response => { result = response; });
  assert.equal(result?.success, true);
});
test("bundled tracker copies use the game scope and preserve other native file calls", () => {
  const copied = [];
  const io = Object.freeze({
    readBinaryFile(_path, callback) { assert.equal(this, io); callback({ success: true }); },
    copyFile(source, destination, _overwrite, _reserved, callback) {
      assert.equal(this, io);
      copied.push([source, destination]);
      callback({ success: true });
    },
  });
  const app = harness("peak", undefined, undefined, undefined, undefined, { io, lockedGlobal: true });
  const assertSuccess = result => assert.equal(result.success, true);
  app.window.overwolf.io.readBinaryFile("world.fwl", assertSuccess);
  app.window.overwolf.io.copyFile("tracking-mod/payload/bridge.dll", "C:\\PEAK\\bridge.dll", true, false, assertSuccess);
  app.window.overwolf.io.copyFile("C:\\game\\settings.cfg", "C:\\backup\\settings.cfg", true, false, assertSuccess);
  assert.deepEqual(copied, [
    ["apps/peak/tracking-mod/payload/bridge.dll", "C:\\PEAK\\bridge.dll"],
    ["C:\\game\\settings.cfg", "C:\\backup\\settings.cfg"],
  ]);
});
test("embedded windows are validated against the host manifest", () => {
  const hostWindows = {
    obtainDeclaredWindow(name, callback) {
      assert.equal(name, "mi_peak_overlay");
      callback({ success: true, window: { id: "native-window-id", name } });
    },
  };
  const app = harness("peak", undefined, undefined, undefined, undefined, { hostWindows, lockedGlobal: true });
  app.window.overwolf.windows.obtainDeclaredWindow("overlay", result => {
    assert.equal(result.window.name, "overlay");
    assert.equal(result.window.id, "native-window-id");
  });
  assert.equal(app.calls.length, 0);
});
test("window messages cannot reach a different game and listeners are disposed", () => {
  const app = harness("peak"); const received = [];
  app.window.overwolf.windows.onMessageReceived.addListener(event => received.push(event.id));
  app.emit({ id: "map-it:app:valheim:position" });
  app.emit({ id: "map-it:app:peak:position" });
  assert.deepEqual(received, ["position"]);
  app.window.overwolf.windows.sendMessage("background", "position", {});
  assert.deepEqual(app.calls.at(-1).slice(0, 2), ["background", "map-it:app:peak:position"]);
  app.window.__MAP_IT_DISPOSE__(); assert.equal(app.callbacks.size, 0);
});
test("native paths point to the imported runtime and readers stop on a switch", () => {
  const app = harness("project-zomboid");
  app.window.overwolf.extensions.current.getExtensionData(result => assert.equal(result.data.path_on_disk, "C:\\MapIt\\apps\\project-zomboid"));
  app.window.overwolf.extensions.current.getExtraObject("reader", () => {});
  app.window.__MAP_IT_DISPOSE__(); app.window.__MAP_IT_DISPOSE__();
  assert.equal(app.stops(), 1);
});
test("Leaflet HTML marker icons use CDN routing while local fallbacks stay bundled", () => {
  const app = harness("elden-ring", storage(), { resolveAsset(url) { return url.endsWith("/maps/grace.png") ? "https://cdn.example/grace.png" : url; }, fetchContent() {} });
  const marker = new app.Element();
  marker.innerHTML = '<img src="/maps/grace.png"><img src="/assets/fallback.png">';
  assert.equal(marker.innerHTML, '<img src="https://cdn.example/grace.png"><img src="http://localhost/apps/elden-ring/assets/fallback.png">');
  assert.equal(app.window.__MAP_IT_REWRITE_STYLE__('url("/maps/grace.png")'), 'url("https://cdn.example/grace.png")');
});

test("imported apps cannot load or replace the host-owned ads provider", async () => {
  const nodes = [];
  const document = { createElement: tag => ({ tag, textContent: "" }), head: { append: node => nodes.push(node) } };
  const app = harness("phantom-blade", storage(), undefined, document);
  const provider = app.window.OwAd;
  let hidden = false;
  const ad = new provider({ closest: selector => {
    assert.equal(selector, "aside");
    return { setAttribute: name => { assert.equal(name, "data-map-it-imported-ad"); hidden = true; } };
  } });
  assert(hidden);
  app.window.OwAd = class UnexpectedAdProvider {};
  assert.equal(app.window.OwAd, provider);
  ad.refreshAd({}); ad.removeAd(); ad.pause();
  await ad.shutdown();
  assert.equal(app.calls.length, 0, "Imported ad lifecycle must never reach a live SDK");
  assert.equal(nodes.filter(node => node.tag === "script").length, 0);
  assert(nodes.some(node => node.textContent.includes("data-map-it-imported-ad")));
});
