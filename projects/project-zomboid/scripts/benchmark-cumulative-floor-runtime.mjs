import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import WebSocket from "ws";

const phase = process.argv.find((argument) => argument.startsWith("--phase="))?.split("=")[1];
const captureOnly = process.argv.includes("--capture-only");
const targetFloor = Number.parseInt(
  process.argv.find((argument) => argument.startsWith("--target-floor="))?.split("=")[1] ?? "29",
  10,
);
if (!phase || !["baseline", "optimized"].includes(phase)) {
  throw new Error("Use --phase=baseline or --phase=optimized.");
}

const outputRoot = resolve(".render-cache/cumulative-floor-a-b");
await mkdir(outputRoot, { recursive: true });

const targets = await fetch("http://127.0.0.1:54284/json/list").then((response) => response.json());
const target = targets.find((candidate) => candidate.title === "Project Zomboid Map");
if (!target?.webSocketDebuggerUrl) throw new Error("Project Zomboid Map Overwolf window was not found.");

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const runtimeErrors = [];
let commandId = 0;

socket.on("message", (data) => {
  const message = JSON.parse(data.toString());
  if (message.method === "Runtime.exceptionThrown") {
    runtimeErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    return;
  }
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

await new Promise((resolveOpen, rejectOpen) => {
  socket.once("open", resolveOpen);
  socket.once("error", rejectOpen);
});

function send(method, params = {}) {
  commandId += 1;
  return new Promise((resolveCommand, rejectCommand) => {
    pending.set(commandId, { resolve: resolveCommand, reject: rejectCommand });
    socket.send(JSON.stringify({ id: commandId, method, params }));
  });
}

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  }
  return response.result.value;
}

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

async function getMapState() {
  return evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const levelButtons = buttons
      .map((button) => ({ button, label: button.getAttribute('aria-label') ?? '', rect: button.getBoundingClientRect() }))
      .filter(({ label, rect }) => label.startsWith('Level ') && rect.width > 0 && rect.height > 0)
      .sort((left, right) => left.rect.y - right.rect.y);
    const upperLabel = levelButtons[0]?.label ?? null;
    const nextFloorLabel = upperLabel?.slice(6) ?? null;
    const parseFloor = (label) => label === 'G' ? 0 : label?.startsWith('B') ? -Number(label.slice(1)) : Number(label);
    const nextFloor = parseFloor(nextFloorLabel);
    return {
      activeFloor: Number.isFinite(nextFloor) ? (levelButtons[0].button.disabled ? nextFloor : nextFloor - 1) : null,
      bodyText: document.body.innerText.slice(0, 1500),
      loading: document.body.innerText.includes('Loading Knox Country'),
      upper: levelButtons[0] ? {
        label: levelButtons[0].label,
        x: levelButtons[0].rect.x + levelButtons[0].rect.width / 2,
        y: levelButtons[0].rect.y + levelButtons[0].rect.height / 2
      } : null,
      mapView: localStorage.getItem('pzim:map-view:builtin:knox-country:isometric')
    };
  })()`);
}

async function waitForMapReady(timeoutMilliseconds = 120_000) {
  const startedAt = Date.now();
  let stableChecks = 0;
  while (Date.now() - startedAt < timeoutMilliseconds) {
    const state = await getMapState();
    stableChecks = state.loading ? 0 : stableChecks + 1;
    if (stableChecks >= 4 && state.upper) return { state, elapsedMs: Date.now() - startedAt };
    await wait(1_000);
  }
  throw new Error("Map did not become ready before the benchmark timeout.");
}

async function moveToFloor(targetFloor) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await getMapState();
    if (state.activeFloor === targetFloor) return;
    if (!state.upper || state.activeFloor === null || state.activeFloor > targetFloor) {
      throw new Error(`Cannot move from floor ${state.activeFloor} to ${targetFloor}.`);
    }
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: state.upper.x, y: state.upper.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: state.upper.x, y: state.upper.y, button: "left", clickCount: 1 });
    await wait(650);
  }
  throw new Error(`Floor ${targetFloor} was not reached.`);
}

async function captureScreenshot(fileName) {
  const screenshot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(resolve(outputRoot, fileName), Buffer.from(screenshot.data, "base64"));
}

async function slowDrag(fromX, fromY, toX, toY, durationMilliseconds = 6_000) {
  const steps = 60;
  const latencies = [];
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: fromX, y: fromY });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: fromX, y: fromY, button: "left", clickCount: 1 });
  for (let step = 1; step <= steps; step += 1) {
    const startedAt = performance.now();
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: fromX + (toX - fromX) * step / steps,
      y: fromY + (toY - fromY) * step / steps,
      button: "left",
      buttons: 1,
    });
    latencies.push(performance.now() - startedAt);
    await wait(durationMilliseconds / steps);
  }
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: toX, y: toY, button: "left", clickCount: 1 });
  return latencies;
}

function summarizeLatencies(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
  return {
    meanMs: values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1),
    p95Ms: percentile(0.95),
    maxMs: sorted.at(-1) ?? 0,
  };
}

await send("Runtime.enable");
await send("Page.enable");
await send("Performance.enable");

if (phase === "optimized") {
  const baselineView = JSON.parse(await readFile(resolve(outputRoot, "baseline-view.json"), "utf8"));
  await evaluate(`(() => {
    const key = 'pzim:map-view:builtin:knox-country:isometric';
    const originalSetItem = Storage.prototype.setItem;
    originalSetItem.call(localStorage, key, ${JSON.stringify(baselineView.mapView)});
    Storage.prototype.setItem = function(storageKey, value) {
      if (this === localStorage && storageKey === key) return;
      return originalSetItem.call(this, storageKey, value);
    };
  })()`);
}

await send("Page.reload", { ignoreCache: true });
await wait(15_000);
await waitForMapReady();
await moveToFloor(targetFloor);
const floorReady = await waitForMapReady();
await wait(12_000);

const initialState = await getMapState();
if (phase === "baseline") {
  await writeFile(resolve(outputRoot, "baseline-view.json"), JSON.stringify({ mapView: initialState.mapView }, null, 2));
}

await captureScreenshot(`${phase}-floor-${targetFloor}-before-pan.png`);
if (captureOnly) {
  const loadedMapImages = await evaluate(`Array.from(document.images)
    .map((image) => image.src)
    .filter((source) => source.includes('_files/'))`);
  console.log(JSON.stringify({ phase, activeFloor: initialState.activeFloor, loadedMapImages }, null, 2));
  socket.close();
  process.exit(0);
}
await evaluate(`(() => {
  performance.clearResourceTimings();
  globalThis.__cumulativeFloorBenchmark = { longTasks: [] };
  try {
    globalThis.__cumulativeFloorBenchmark.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) globalThis.__cumulativeFloorBenchmark.longTasks.push(entry.duration);
    });
    globalThis.__cumulativeFloorBenchmark.observer.observe({ entryTypes: ['longtask'] });
  } catch (error) {
    globalThis.__cumulativeFloorBenchmark.observerError = String(error);
  }
})()`);

const beforeMetrics = await send("Performance.getMetrics");
const dragLatencies = [];
dragLatencies.push(...await slowDrag(470, 470, 760, 470));
await wait(8_000);
dragLatencies.push(...await slowDrag(760, 470, 470, 470));
await wait(8_000);
const afterMetrics = await send("Performance.getMetrics");
await captureScreenshot(`${phase}-after-pan.png`);

const browserMetrics = await evaluate(`(() => {
  globalThis.__cumulativeFloorBenchmark?.observer?.disconnect();
  const resources = performance.getEntriesByType('resource')
    .filter((entry) => entry.name.includes('/global/'))
    .map((entry) => ({ name: entry.name, duration: entry.duration, transferSize: entry.transferSize }));
  return {
    longTasks: globalThis.__cumulativeFloorBenchmark?.longTasks ?? [],
    observerError: globalThis.__cumulativeFloorBenchmark?.observerError ?? null,
    resources,
    finalState: document.body.innerText.slice(0, 1500)
  };
})()`);

const resourceLayers = {};
for (const resource of browserMetrics.resources) {
  const match = resource.name.match(/\/global\/([^/]+)_files\//);
  const layer = match?.[1] ?? "other";
  const summary = resourceLayers[layer] ?? { requests: 0, totalDurationMs: 0, transferBytes: 0 };
  summary.requests += 1;
  summary.totalDurationMs += resource.duration;
  summary.transferBytes += resource.transferSize;
  resourceLayers[layer] = summary;
}

const metricValue = (metrics, name) => metrics.metrics.find((metric) => metric.name === name)?.value ?? null;
const report = {
  phase,
  activeFloor: initialState.activeFloor,
  floorReadyMs: floorReady.elapsedMs,
  mapView: initialState.mapView,
  dragCommandLatency: summarizeLatencies(dragLatencies),
  longTasks: {
    count: browserMetrics.longTasks.length,
    totalMs: browserMetrics.longTasks.reduce((total, duration) => total + duration, 0),
    maxMs: Math.max(0, ...browserMetrics.longTasks),
    durations: browserMetrics.longTasks,
    observerError: browserMetrics.observerError,
  },
  resourceLayers,
  jsHeapUsedBefore: metricValue(beforeMetrics, "JSHeapUsedSize"),
  jsHeapUsedAfter: metricValue(afterMetrics, "JSHeapUsedSize"),
  runtimeErrors,
};

await writeFile(resolve(outputRoot, `${phase}-report.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
socket.close();
