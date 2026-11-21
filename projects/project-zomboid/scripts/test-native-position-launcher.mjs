import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString("base64")}`;
const paths = moduleUrl(await readFile(new URL("../src/features/live-bridge/live-bridge-paths.ts", import.meta.url), "utf8"));
const source = (await readFile(new URL("../src/features/live-position/native-position-launcher.ts", import.meta.url), "utf8"))
  .replace('"../live-bridge/live-bridge-paths"', JSON.stringify(paths));
const { startNativePositionLauncher } = await import(moduleUrl(source));
const settle = () => new Promise((resolve) => setImmediate(resolve));
const event = () => {
  const listeners = new Set();
  return { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn),
    emit: value => [...listeners].forEach(fn => fn(value)), listeners };
};
let tick;
let launches = [];
let pings = [];
let kills = [];
let completeLaunch;
let delayLaunch = false;
const plugin = {
  onProcessExited: event(), onDataReceivedEvent: event(),
  launchProcess: (...args) => {
    launches.push(args.slice(0, 5));
    completeLaunch = () => args[5]({ data: 500 });
    if (!delayLaunch) completeLaunch();
  },
  sendTextToProcess: (...args) => pings.push(args), terminateProcess: pid => kills.push(pid),
};
globalThis.window = { setInterval: fn => { tick = fn; return 1; }, clearInterval: () => {} };
globalThis.overwolf = {
  extensions: { current: {
    getExtraObject: (_, cb) => cb({ success: true, object: plugin }),
    getExtensionData: cb => cb({ success: true, data: { path_on_disk: "C:\\App Path" } }),
  } },
  io: { paths: { localAppData: "C:\\Users\\Test User\\AppData\\Local" } },
  games: { getRunningGameInfo: cb => cb({ isRunning: true, classId: 10598, processId: 42 }) },
};
let stop = startNativePositionLauncher();
await settle();
assert.equal(launches.length, 1, "Already-running game starts without waiting for a game event");
assert.equal(launches[0][0], "C:\\App Path\\native-position\\runtime\\bin\\java.exe");
assert.match(launches[0][1], /42 "C:\\Users\\Test User\\Zomboid\\Lua\\PZInteractiveMapNative"/);
assert.deepEqual(launches[0].slice(3), [true, true], "Hidden child must terminate with app");
tick(); await settle();
assert.equal(launches.length, 1, "Keepalives must not spawn duplicate readers");
assert.ok(pings.length >= 2);
stop();
assert.deepEqual(kills, [500]);
assert.equal(plugin.onProcessExited.listeners.size, 0);
assert.equal(plugin.onDataReceivedEvent.listeners.size, 0);

delayLaunch = true;
stop = startNativePositionLauncher();
await settle();
stop(); completeLaunch(); await settle();
assert.deepEqual(kills, [500, 500], "A late launch callback must not orphan a child");
console.log("Automatic native position launch and teardown tests passed.");
