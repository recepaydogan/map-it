import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile(
  new URL("../src/overwolf/tracking-installer.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const payload = JSON.parse((await readFile(new URL("../public/tracking-mod/payload-manifest.json", import.meta.url), "utf8")).replace(/^\uFEFF/, ""));
const loadInstaller = ({ existing = [], files = {}, running = null, copyFails = false } = {}) => {
  const existingPaths = new Set(existing.map((path) => path.toLowerCase()));
  const fileContents = new Map(
    Object.entries(files).map(([path, contents]) => [path.toLowerCase(), contents]),
  );
  const visited = [];
  const copied = [];
  const statuses = [];
  const storage = new Map();
  const exports = {};
  let runningGame = running;
  const overwolf = {
    games: {
      getRunningGameInfo: (done) => done(runningGame ?? { success: true, isRunning: false }),
      getGameInfo: (_gameId, done) => done({ success: false }),
      launchers: {
        getRunningLaunchersInfo: (done) => done({ success: true, launchers: [] }),
      },
    },
    io: {
      enums: { eEncoding: { UTF8: "UTF8" } },
      paths: {
        programFilesX86: "C:\\Program Files (x86)",
        programFiles: "C:\\Program Files",
      },
      fileExists: (path, done) => {
        visited.push(path);
        done({ success: true, found: existingPaths.has(path.toLowerCase()) });
      },
      readFileContents: (path, _encoding, done) => {
        const content = fileContents.get(path.toLowerCase());
        done(content === undefined ? { success: false } : { success: true, content });
      },
      writeFileContents: (_path, _contents, _encoding, _create, done) => done({ success: true }),
      copyFile: (source, destination, _overwrite, _create, done) => {
        copied.push(source.replace("tracking-mod/payload/", ""));
        if (!copyFails) {
          existingPaths.add(destination.toLowerCase());
          if (source.endsWith("/bridge-version.txt")) fileContents.set(destination.toLowerCase(), "2.0.0");
        }
        done({ success: !copyFails, error: copyFails ? "locked" : undefined });
      },
    },
  };

  runInNewContext(compiled, {
    exports,
    require: (name) => ({
      "../config/app-config": { APP_CONFIG: { supportedGameId: 26092 } },
      "../state/peak-session-store": {
        updatePeakSession: (patch) => statuses.push(patch.trackingStatus),
      },
      "../utils/analytics/analytics": { track: () => undefined },
      "../utils/analytics/events": { EVENTS: {} },
      "../utils/analytics/install-path": {
        installPathAnalyticsProperties: (directory) => ({ install_directory: directory }),
      },
    })[name] ?? require(name),
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    overwolf,
    window: { setTimeout, clearTimeout },
    console,
    fetch: async () => ({ ok: true, text: async () => "2.0.0", json: async () => payload }),
  });

  return { installer: exports, visited, copied, statuses, setRunningGame: (game) => { runningGame = game; } };
};

{
  const directory = "D:\\Games\\PEAK";
  const pathOf = (file) => `${directory}\\${file.replaceAll("/", "\\")}`;
  const pluginFiles = payload.filter((file) => file.startsWith("BepInEx/plugins/PeakMap/"));
  const options = {
    existing: payload.map(pathOf),
    files: { [pathOf("BepInEx/plugins/PeakMap/bridge-version.txt")]: "2.0.0" },
    running: { isRunning: true, classId: 26092, executionPath: `${directory}\\PEAK.exe` },
  };
  const complete = loadInstaller(options);
  await complete.installer.ensureTrackingBridge();
  assert.deepEqual(complete.copied, []);
  assert.equal(complete.statuses.at(-1), "ready");

  // Each missing packaged file must trigger repair even with a current marker.
  for (const missing of payload) {
    const test = loadInstaller({ ...options, existing: options.existing.filter((path) => path !== pathOf(missing)) });
    await test.installer.ensureTrackingBridge();
    assert.deepEqual(test.copied, payload.filter((file) => pluginFiles.includes(file) || file === missing));
    assert.equal(test.statuses.at(-1), "restart-required");
  }
  const fresh = loadInstaller({ ...options, existing: [], files: {} });
  await fresh.installer.ensureTrackingBridge();
  assert.deepEqual(fresh.copied, payload);
  const forced = loadInstaller(options);
  await forced.installer.ensureTrackingBridge(true);
  assert.deepEqual(forced.copied, pluginFiles);
  const failed = loadInstaller({ ...options, existing: [], copyFails: true });
  await failed.installer.ensureTrackingBridge();
  assert.equal(failed.statuses.at(-1), "pending");

  const running = { ...options.running, processId: 100 };
  const restart = loadInstaller({ ...options, running, existing: [], files: {} });
  await restart.installer.ensureTrackingBridge();
  assert.equal(restart.statuses.at(-1), "restart-required");
  await restart.installer.ensureTrackingBridge();
  assert.equal(restart.statuses.at(-1), "restart-required", "A recheck in the same game must keep the notice");
  assert.equal(restart.copied.length, payload.length);
  restart.setRunningGame({ ...running, processId: 101 });
  await restart.installer.ensureTrackingBridge();
  assert.equal(restart.statuses.at(-1), "ready", "The next PEAK process clears the restart requirement");
}

{
  const installPathSource = await readFile(
    new URL("../src/utils/analytics/install-path.ts", import.meta.url),
    "utf8",
  );
  const installPathExports = {};
  runInNewContext(ts.transpileModule(installPathSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: installPathExports });
  assert.deepEqual(
    { ...installPathExports.installPathAnalyticsProperties("C:/Users/Alice/Games/PEAK/") },
    {
      install_directory: "C:\\Users\\<user>\\Games\\PEAK",
      executable_path: "C:\\Users\\<user>\\Games\\PEAK\\PEAK.exe",
    },
  );
  assert.deepEqual(
    { ...installPathExports.installPathAnalyticsProperties("D:\\SteamLibrary\\steamapps\\common\\PEAK") },
    {
      install_directory: "D:\\SteamLibrary\\steamapps\\common\\PEAK",
      executable_path: "D:\\SteamLibrary\\steamapps\\common\\PEAK\\PEAK.exe",
    },
  );
}

{
  const { installer } = loadInstaller();
  assert.deepEqual(
    [...installer.parseSteamLibraryFolders(String.raw`
      "path" "R:\\My Games"
      "2" "S:\\LegacyLibrary"
      "3527290" "123456"
    `)],
    ["R:\\My Games", "S:\\LegacyLibrary"],
  );
}

{
  const custom = "R:\\My Games\\steamapps\\common\\PEAK";
  const { installer } = loadInstaller({
    existing: [`${custom}\\PEAK.exe`],
    files: {
      "C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf": String.raw`
        "libraryfolders" { "1" { "path" "R:\\My Games" } }
      `,
    },
  });
  assert.equal(await installer.resolvePeakDirectory(), custom);
}

{
  const fallback = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\PEAK";
  const { installer } = loadInstaller({
    existing: [`${fallback}\\PEAK.exe`],
    running: {
      success: true,
      isRunning: true,
      classId: 99999,
      id: 999990,
      executionPath: "D:\\Other Game\\PEAK.exe",
    },
  });
  assert.equal(await installer.resolvePeakDirectory(), fallback);
}

{
  const runningDirectory = "D:\\Games\\PEAK";
  const { installer } = loadInstaller({
    running: {
      success: true,
      isRunning: true,
      classId: 26092,
      id: 260920,
      executionPath: `${runningDirectory}\\PEAK.exe`,
    },
  });
  assert.equal(await installer.resolvePeakDirectory(), runningDirectory);
}

{
  const conventional = "S:\\SteamLibrary\\steamapps\\common\\PEAK";
  const { installer } = loadInstaller({ existing: [`${conventional}\\PEAK.exe`] });
  assert.equal(await installer.resolvePeakDirectory(), conventional);
}

{
  const nested = "T:\\Games\\steamapps\\common\\PEAK";
  const { installer } = loadInstaller({ existing: [`${nested}\\PEAK.exe`] });
  assert.equal(await installer.findSelectedPeakDirectory("T:\\Games"), nested);
}

console.log("Tracking installer tests passed: Steam fallbacks, game identity, manual selection, and privacy-safe analytics paths.");
