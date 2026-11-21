/** Real CDN + real filesystem smoke test. The adapter does not validate the Overwolf host or game. */
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const stage = await mkdtemp(path.join(os.tmpdir(), "wfm-addon-cdn-test-"));
const client = path.join(stage, "_forever_");
const game = path.join(client, "Wow.exe");
const addonDirectory = path.join(client, "Interface", "AddOns", "wfm-position-bridge");
const storage = new Map();
const fetchOriginal = globalThis.fetch;
const warnOriginal = console.warn;
const errorOriginal = console.error;
let offline = false;
let requests = 0;
try {
  await mkdir(client);
  await writeFile(game, "");
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  globalThis.fetch = (...args) => {
    if (offline) return Promise.reject(new Error("Simulated offline test"));
    requests++;
    return fetchOriginal(...args);
  };
  globalThis.overwolf = {
    games: {
      getRunningGameInfo: callback => callback(null),
      getGameInfo: (_id, callback) => callback({ success: true, gameInfo: { ProcessPath: game } }),
    },
    io: {
      paths: {},
      fileExists: (file, callback) => access(file).then(() => callback({ success: true, found: true }), () => callback({ success: true, found: false })),
      readFileContents: (file, _encoding, callback) => readFile(file, "utf8").then(content => callback({ success: true, content }), () => callback({ success: false })),
      writeFileContents: (file, content, _encoding, uac, callback) => {
        assert.equal(uac, true);
        assert.equal(path.dirname(file), addonDirectory);
        mkdir(addonDirectory, { recursive: true }).then(() => writeFile(file, content, "utf8"))
          .then(() => callback({ success: true }), error => callback({ success: false, error: error.message }));
      },
    },
  };
  const bundled = await build({
    entryPoints: [path.join(root, "src/features/live-position/position-addon-installer.ts")],
    bundle: true, format: "esm", platform: "node", write: false,
  });
  const { ensurePositionAddonInstalled } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
  const installed = await ensurePositionAddonInstalled();
  assert.equal(installed.state, "installed");
  assert.equal(installed.source, "cdn");
  assert.equal(installed.changed, true);
  const files = await readdir(addonDirectory);
  const luaName = files.find(name => name.endsWith(".lua"));
  const lua = await readFile(path.join(addonDirectory, luaName), "utf8");
  const toc = await readFile(path.join(addonDirectory, "wfm-position-bridge.toc"), "utf8");
  assert.ok(toc.includes(luaName));
  assert.match(toc, /^## SavedVariables: WFM_CharacterDB$/m);
  assert.match(toc, /^## DefaultState: enabled$/m);
  assert.ok(lua.includes(`WFM_BRIDGE_VERSION = "${installed.version}"`));
  assert.equal((await ensurePositionAddonInstalled()).changed, false);
  console.warn = () => {};
  console.error = () => {};
  offline = true;
  await rm(path.join(addonDirectory, luaName));
  const repaired = await ensurePositionAddonInstalled();
  assert.equal(repaired.source, "cache");
  assert.equal(repaired.changed, true);
  assert.equal(await readFile(path.join(addonDirectory, luaName), "utf8"), lua);
  console.log(JSON.stringify({ result: "passed", version: installed.version, requests,
    checks: ["live CDN download", "SHA-256/schema/protocol", "filesystem install/read-back", "unchanged install", "offline repair"],
    scope: "Filesystem adapter; Overwolf host/UAC and live game are separate runtime checks." }, null, 2));
} finally {
  globalThis.fetch = fetchOriginal;
  console.warn = warnOriginal;
  console.error = errorOriginal;
  delete globalThis.overwolf;
  delete globalThis.localStorage;
  if (path.dirname(stage) !== path.resolve(os.tmpdir()) || !path.basename(stage).startsWith("wfm-addon-cdn-test-")) {
    throw new Error("Unsafe smoke-test cleanup path");
  }
  await rm(stage, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
