import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const bundle = await build({
  stdin: { contents: `export * from './position-addon-installer'; export * from './position-addon-package';`,
    resolveDir: fileURLToPath(new URL(".", import.meta.url)), loader: "ts" },
  bundle: true, format: "esm", platform: "node", write: false,
});
const { positionAddonDirectoryFromPath, ensurePositionAddonInstalled, subscribePositionAddonUpdates,
  readInstalledPositionAddonVersion, ADDON_CACHE_KEY, MAX_ADDON_PACKAGE_BYTES } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`,
);
const client = "D:\\Games\\World of Warcraft\\_forever_";
const destination = `${client}\\Interface\\AddOns\\wfm-position-bridge`;
const tocPath = `${destination}\\wfm-position-bridge.toc`;
const baseUrl = "https://wowforever.ingredientassets.com/addons/wow-forever/position-bridge/v1";
const sha = text => createHash("sha256").update(text).digest("hex");
const release = (version = "0.1.0", patch = {}) => {
  const serialized = JSON.stringify({ schemaVersion: 1, protocolVersion: 1, version, interfaceVersion: 16001,
    lua: `-- CDN fixture ${version}\nWFM_BRIDGE_VERSION = "${version}"\n`, ...patch });
  return { serialized, sha256: sha(serialized) };
};
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

function setup(t, { runningPath = `${client}\\Wow.exe`, installedPath } = {}) {
  const h = { files: new Map(), storage: new Map(), writes: [], requests: [], errors: [], warnings: [],
    current: release(), offline: false, releases: new Map(), failWrite: () => false, corruptWrite: () => false };
  h.releases.set(h.current.sha256, h.current.serialized);
  h.publish = next => { h.current = next; h.releases.set(next.sha256, next.serialized); };
  t.mock.method(console, "info", () => {});
  t.mock.method(console, "warn", (...args) => h.warnings.push(args));
  t.mock.method(console, "error", (...args) => h.errors.push(args));
  t.mock.method(globalThis, "fetch", async input => {
    h.requests.push(String(input));
    if (h.offline) throw new Error("offline");
    const url = new URL(input);
    assert.equal(url.origin, new URL(baseUrl).origin);
    if (url.pathname.endsWith("/current.json")) return new Response(JSON.stringify(h.channel ?? { schemaVersion: 1, sha256: h.current.sha256 }));
    const hash = url.pathname.match(/\/releases\/([a-f0-9]{64})\.json$/)?.[1];
    return new Response(h.releases.get(hash) ?? "not found", { status: h.releases.has(hash) ? 200 : 404 });
  });
  globalThis.localStorage = { getItem: key => h.storage.get(key) ?? null, setItem: (key, value) => h.storage.set(key, value) };
  globalThis.overwolf = {
    games: {
      getRunningGameInfo: done => done({ isRunning: Boolean(runningPath), executionPath: runningPath }),
      getGameInfo: (_id, done) => done({ success: Boolean(installedPath), gameInfo: { ProcessPath: installedPath } }),
    },
    io: {
      paths: {},
      fileExists: (path, done) => done({ success: true, found: path === installedPath || h.files.has(path) }),
      readFileContents: (path, _encoding, done) => done({ success: h.files.has(path), content: h.files.get(path) }),
      writeFileContents: (path, contents, _encoding, uac, done) => {
        h.writes.push({ path, uac, contents });
        if (h.failWrite(path)) { done({ success: false, error: "access-denied" }); return; }
        h.files.set(path, h.corruptWrite(path) ? "corrupt" : contents);
        done({ success: true });
      },
    },
  };
  t.after(() => { delete globalThis.overwolf; delete globalThis.localStorage; delete globalThis.window; });
  return h;
}

test("accepts only the standalone Forever client and rejects traversal", () => {
  assert.equal(positionAddonDirectoryFromPath(`${client}/Wow.exe`), client);
  assert.equal(positionAddonDirectoryFromPath(`"${client}\\Wow.exe"`), client);
  for (const path of ["C:/WoW/_retail_/Wow.exe", "C:/WoW/_classic_beta_/WowB.exe", "_forever_/Wow.exe",
    "C:/WoW/../_forever_/Wow.exe", "C:/WoW/_forever_/other.exe", "C:/WoW/./_forever_", "C:/WoW/\n_forever_"]) {
    assert.equal(positionAddonDirectoryFromPath(path), null);
  }
});

test("downloads, verifies, coalesces installation and caches only after read-back", async t => {
  const h = setup(t);
  const results = await Promise.all([ensurePositionAddonInstalled(), ensurePositionAddonInstalled()]);
  assert.deepEqual(results[0], { state: "installed", changed: true, version: "0.1.0", source: "cdn" });
  assert.equal(h.requests.length, 2);
  assert.equal(h.writes.length, 2);
  assert.equal(h.writes[0].path, `${destination}\\wfm-position-bridge-${h.current.sha256}.lua`);
  assert.equal(h.writes[1].path, tocPath);
  assert.ok(h.writes.every(({ path, uac }) => path.startsWith(`${destination}\\`) && uac));
  assert.match(h.files.get(tocPath), /## Interface: 16001/);
  assert.match(h.files.get(tocPath), /^## DefaultState: enabled$/m);
  assert.match(h.files.get(tocPath), /^## Title: WFM Addon$/m);
  assert.doesNotMatch(h.files.get(tocPath), /Position Bridge/i);
  assert.match(h.files.get(tocPath), /## SavedVariables: WFM_CharacterDB/);
  assert.match(h.files.get(h.writes[0].path), /WFM_BRIDGE_VERSION = "0\.1\.0"/);
  assert.equal(JSON.parse(h.storage.get(ADDON_CACHE_KEY)).sha256, h.current.sha256);
  for (const [path, contents] of h.files) h.files.set(path, `\uFEFF${contents.replaceAll("\n", "\r\n")}`);
  assert.equal((await ensurePositionAddonInstalled()).changed, false);
  assert.equal(h.writes.length, 2);
  assert.equal(h.requests.length, 3, "unchanged channel reuses verified payload");
});

test("discovers a closed custom installation and never installs into retail", async t => {
  const h = setup(t, { runningPath: "C:\\WoW\\_retail_\\Wow.exe", installedPath: `${client}\\Wow.exe` });
  assert.equal((await ensurePositionAddonInstalled()).state, "installed");
  assert.ok(h.writes.every(({ path }) => path.startsWith(client)));
});

test("no verified client means no download or writes", async t => {
  const h = setup(t, { runningPath: null, installedPath: "C:\\WoW\\_retail_\\Wow.exe" });
  assert.deepEqual(await ensurePositionAddonInstalled(), { state: "not-found" });
  assert.equal(h.requests.length, 0);
  assert.equal(h.writes.length, 0);
});

test("a new CDN release changes interface/version without app changes; channel rollback works", async t => {
  const h = setup(t);
  const old = h.current;
  await ensurePositionAddonInstalled();
  h.publish(release("0.2.0", { interfaceVersion: 16002 }));
  const observed = [];
  const unsubscribe = subscribePositionAddonUpdates(result => observed.push(result));
  const next = await ensurePositionAddonInstalled();
  unsubscribe();
  assert.equal(next.version, "0.2.0");
  assert.match(h.files.get(tocPath), /## Interface: 16002/);
  assert.match(h.files.get(tocPath), new RegExp(h.current.sha256));
  assert.equal(observed.length, 1);
  assert.ok(h.files.has(`${destination}\\wfm-position-bridge-${old.sha256}.lua`));
  h.publish(old);
  assert.equal((await ensurePositionAddonInstalled()).version, "0.1.0");
  assert.match(h.files.get(tocPath), new RegExp(old.sha256));
});

test("a requested offline installation repairs files from the last successfully installed package", async t => {
  const h = setup(t);
  await ensurePositionAddonInstalled();
  h.files.clear();
  h.offline = true;
  assert.deepEqual(await ensurePositionAddonInstalled(), { state: "installed", changed: true, version: "0.1.0", source: "cache" });
  assert.equal(h.files.size, 2);
});

test("offline first install preserves legacy files and retries when connectivity returns", async t => {
  const h = setup(t);
  h.files.set(tocPath, "old installed TOC");
  h.offline = true;
  assert.deepEqual(await ensurePositionAddonInstalled(), { state: "error" });
  assert.equal(h.writes.length, 0);
  assert.equal(h.files.get(tocPath), "old installed TOC");
  h.offline = false;
  assert.equal((await ensurePositionAddonInstalled()).state, "installed");
});

test("corrupt CDN bytes and incompatible protocols cannot replace installed files or good cache", async t => {
  const h = setup(t);
  await ensurePositionAddonInstalled();
  const previousCache = h.storage.get(ADDON_CACHE_KEY);
  h.releases.set("a".repeat(64), "tampered");
  h.current = { sha256: "a".repeat(64) };
  assert.equal((await ensurePositionAddonInstalled()).source, "cache");
  h.publish(release("9.0.0", { protocolVersion: 2 }));
  assert.equal((await ensurePositionAddonInstalled()).source, "cache");
  assert.equal(h.writes.length, 2);
  assert.equal(h.storage.get(ADDON_CACHE_KEY), previousCache);
});

test("invalid hashes, traversal, payload metadata and oversized bodies never reach the filesystem", async t => {
  const h = setup(t);
  for (const channel of [{ schemaVersion: 1, sha256: null }, { schemaVersion: 2, sha256: h.current.sha256 },
    { schemaVersion: 1, sha256: "../evil.lua" }]) {
    h.channel = channel;
    assert.equal((await ensurePositionAddonInstalled()).state, "error");
  }
  delete h.channel;
  for (const patch of [{ version: "0.1.0\nmalicious.lua" }, { interfaceVersion: -1 }, { lua: "" }, { lua: "abc\0def" },
    { lua: "x".repeat(MAX_ADDON_PACKAGE_BYTES) }]) {
    h.publish(release("0.1.0", patch));
    assert.equal((await ensurePositionAddonInstalled()).state, "error");
  }
  assert.equal(h.writes.length, 0);
  assert.equal(h.storage.has(ADDON_CACHE_KEY), false);
});

test("corrupt persistent cache is rejected offline", async t => {
  const h = setup(t);
  h.storage.set(ADDON_CACHE_KEY, JSON.stringify({ sha256: h.current.sha256, serialized: "tampered" }));
  h.offline = true;
  assert.equal((await ensurePositionAddonInstalled()).state, "error");
  assert.equal(h.writes.length, 0);
});

test("failed Lua writes preserve old TOC/cache; failed TOC read-back restores old TOC", async t => {
  const h = setup(t);
  await ensurePositionAddonInstalled();
  const previousToc = h.files.get(tocPath);
  const previousCache = h.storage.get(ADDON_CACHE_KEY);
  h.publish(release("0.2.0"));
  h.failWrite = path => path.endsWith(".lua");
  assert.equal((await ensurePositionAddonInstalled()).state, "error");
  assert.equal(h.files.get(tocPath), previousToc);
  assert.equal(h.storage.get(ADDON_CACHE_KEY), previousCache);
  h.failWrite = () => false;
  let corruptOnce = true;
  h.corruptWrite = path => { if (path === tocPath && corruptOnce) { corruptOnce = false; return true; } return false; };
  assert.equal((await ensurePositionAddonInstalled()).state, "error");
  assert.equal(h.files.get(tocPath), previousToc);
  assert.equal(h.storage.get(ADDON_CACHE_KEY), previousCache);
  assert.equal((await ensurePositionAddonInstalled()).version, "0.2.0");
});

test("installed-addon detection never downloads, writes or repairs a missing addon", async t => {
  const h = setup(t);
  assert.equal(await readInstalledPositionAddonVersion(client), null);
  assert.equal(h.requests.length, 0); assert.equal(h.writes.length, 0);
  await ensurePositionAddonInstalled();
  const requests = h.requests.length, writes = h.writes.length;
  assert.equal(await readInstalledPositionAddonVersion(client), "0.1.0");
  h.files.delete(h.writes[0].path);
  assert.equal(await readInstalledPositionAddonVersion(client), null, "a leftover TOC is not a working installation");
  h.files.set(tocPath, "## Version: 0.1.0\n## SavedVariables: WFM_CharacterDB\n..\\escape.lua\n");
  assert.equal(await readInstalledPositionAddonVersion(client), null);
  assert.equal(await readInstalledPositionAddonVersion("C:\\WoW\\_retail_"), null);
  assert.equal(h.requests.length, requests); assert.equal(h.writes.length, writes);
});

test("a stalled CDN request times out and releases the install lock", async t => {
  setup(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(globalThis, "fetch", (_input, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }));
  const pending = ensurePositionAddonInstalled();
  await flush();
  t.mock.timers.tick(8000);
  assert.equal((await pending).state, "error");
});

test("a missing native write callback times out; the next check can retry", async t => {
  setup(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const normalWrite = overwolf.io.writeFileContents;
  let reachedWrite;
  const writing = new Promise(resolve => { reachedWrite = resolve; });
  overwolf.io.writeFileContents = () => reachedWrite();
  const pending = ensurePositionAddonInstalled();
  await writing;
  t.mock.timers.tick(60_000);
  assert.equal((await pending).state, "error");
  overwolf.io.writeFileContents = normalWrite;
  assert.equal((await ensurePositionAddonInstalled()).state, "installed");
});

test("cache storage failure cannot invalidate a verified installation", async t => {
  const h = setup(t);
  localStorage.setItem = () => { throw new Error("quota exceeded"); };
  assert.equal((await ensurePositionAddonInstalled()).state, "installed");
  assert.equal(h.writes.length, 2);
  assert.equal(h.storage.has(ADDON_CACHE_KEY), false);
});


test("the explicit installer can install into a fresh app profile", async t => {
  const h=setup(t);
  assert.equal((await ensurePositionAddonInstalled()).state,"installed");
  assert.equal(h.requests.length,2);assert.equal(h.writes.length,2);
});

test("the explicit installer does not depend on obsolete activation preferences", async t => {
  const h=setup(t);
  h.storage.set("wfm:addon-file-sync:v1",JSON.stringify({version:1,enabled:false,status:"disabled"}));
  assert.equal((await ensurePositionAddonInstalled()).state,"installed");
  assert.equal(h.requests.length,2);assert.equal(h.writes.length,2);
});
