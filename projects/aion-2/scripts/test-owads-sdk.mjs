import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/components/ads/owads-sdk.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const telemetryCode = ts.transpileModule(readFileSync(new URL("../src/components/ads/ad-telemetry.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function harness() {
  const scripts = [];
  const attached = [];
  const timers = new Map();
  const warnings = [];
  const errors = [];
  const events = [];
  let now = 0;
  let timerId = 0;
  const window = {
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const document = {
    querySelector: () => attached[0] ?? null,
    createElement() {
      const listeners = new Map();
      const script = {
        dataset: {},
        addEventListener(event, callback) { listeners.set(event, callback); },
        removeEventListener(event, callback) { if (listeners.get(event) === callback) listeners.delete(event); },
        remove() { const index = attached.indexOf(script); if (index !== -1) attached.splice(index, 1); },
        emit(event) { listeners.get(event)?.(); },
        get listenerCount() { return listeners.size; },
      };
      scripts.push(script);
      return script;
    },
    head: { appendChild(script) { attached.push(script); } },
  };
  const context = {
    exports: {}, window, document, overwolf: {},
    navigator: { onLine: true },
    Date: { now: () => now },
    console: { warn: (...args) => warnings.push(args), error: (...args) => errors.push(args) },
  };
  const telemetry = { ...context, exports: {}, require: () => ({ track: (event, props) => events.push({ event, ...props }) }) };
  vm.runInNewContext(telemetryCode, telemetry);
  context.require = () => telemetry.exports;
  vm.runInNewContext(outputText, context);
  return {
    ...context.exports, context, window, document, scripts, attached, timers, warnings, errors, events,
    async tick(delay) {
      await flush();
      assert.equal(timers.size, 1, "Only one load or retry timer should be active");
      const [id, timer] = [...timers][0];
      assert.equal(timer.delay, delay);
      timers.delete(id);
      now += delay;
      timer.callback();
      await flush();
    },
    succeed(script = scripts.at(-1)) { window.OwAd = function OwAd() {}; script.emit("load"); },
    clean() {
      assert.equal(timers.size, 0);
      assert.ok(scripts.every(script => script.listenerCount === 0));
      assert.deepEqual(errors, []);
    },
  };
}

// Concurrent consumers share a single download and reuse a successful SDK.
{
  const h = harness();
  const first = h.loadOwAdsSdk();
  const second = h.loadOwAdsSdk();
  assert.equal(h.scripts.length, 1);
  h.succeed();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(await h.loadOwAdsSdk(), true);
  assert.equal(h.scripts.length, 1);
  assert.equal(h.warnings.length, 0);
  assert.equal(h.events.length, 1, "Concurrent callers and cached reuse must not duplicate telemetry");
  assert.equal(h.events[0].event, "ADS_SDK_LOAD_RESULT");
  assert.equal(h.events[0].loaded, true);
  assert.equal(h.events[0].attempts, 1);
  h.clean();
}

// Recovery is automatic: neither consumer needs to invoke the loader again.
{
  const h = harness();
  const first = h.loadOwAdsSdk();
  h.scripts[0].emit("error");
  assert.equal(h.attached.length, 0);
  const second = h.loadOwAdsSdk();
  await h.tick(2_000);
  assert.equal(h.scripts.length, 2);
  h.succeed();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(h.warnings.length, 1);
  assert.equal(h.events[0].reason, "download_error");
  assert.equal(h.events[0].retry_scheduled, true);
  assert.equal(h.events[1].recovered_after_retry, true);
  assert.equal(h.events[1].attempts, 2);
  h.clean();
}

// A download that never emits load/error cannot leave the caller pending forever.
{
  const h = harness();
  const result = h.loadOwAdsSdk();
  await h.tick(15_000);
  assert.equal(h.attached.length, 0);
  assert.equal(h.scripts[0].listenerCount, 0);
  await h.tick(2_000);
  h.succeed();
  assert.equal(await result, true);
  assert.equal(h.events[0].reason, "timeout");
  assert.equal(h.events[0].elapsed_ms, 15000);
  assert.equal(h.events[1].elapsed_ms, 17000);
  h.clean();
}

// Three failed attempts stop; a later mount can start a fresh bounded load.
{
  const h = harness();
  const result = h.loadOwAdsSdk();
  h.scripts.at(-1).emit("error");
  await h.tick(2_000);
  h.scripts.at(-1).emit("error");
  await h.tick(5_000);
  h.scripts.at(-1).emit("error");
  assert.equal(await result, false);
  assert.equal(h.scripts.length, 3);
  assert.equal(h.attached.length, 0);
  assert.equal(h.events.length, 4);
  assert.equal(h.events[2].retry_scheduled, false);
  assert.equal(h.events[3].reason, "attempts_exhausted");
  assert.equal(h.events[3].loaded, false);
  h.clean();
  const recovery = h.loadOwAdsSdk();
  assert.equal(h.scripts.length, 4);
  h.succeed();
  assert.equal(await recovery, true);
  h.clean();
}

// Loading a file without defining OwAd is a failure, not a ready SDK.
{
  const h = harness();
  const result = h.loadOwAdsSdk();
  h.scripts[0].emit("load");
  assert.equal(h.events[0].reason, "missing_global");
  await h.tick(2_000);
  h.succeed();
  assert.equal(await result, true);
  h.clean();
}

// A late SDK success during backoff prevents another download.
{
  const h = harness();
  const result = h.loadOwAdsSdk();
  await h.tick(15_000);
  h.succeed(h.scripts[0]);
  await h.tick(2_000);
  assert.equal(await result, true);
  assert.equal(h.scripts.length, 1);
  assert.equal(h.events.at(-1).reason, "late_success");
  assert.equal(h.events.at(-1).recovered_after_retry, true);
  h.clean();
}

// Reuse a pending script, but replace a stale loaded script without OwAd.
for (const stale of [false, true]) {
  const h = harness();
  const existing = h.document.createElement("script");
  if (stale) existing.dataset.loaded = "true";
  h.document.head.appendChild(existing);
  const result = h.loadOwAdsSdk();
  assert.equal(h.scripts.length, stale ? 2 : 1);
  assert.equal(h.attached.length, 1);
  h.succeed();
  assert.equal(await result, true);
  h.clean();
}

// Browser previews cannot load or retry the advertising SDK.
{
  const h = harness();
  delete h.context.overwolf;
  assert.equal(await h.loadOwAdsSdk(), false);
  assert.equal(h.scripts.length, 0);
  assert.equal(h.events.length, 0);
  h.clean();
}

// Unexpected setup errors produce a final diagnostic and do not strand callers.
{
  const h = harness();
  h.document.head.appendChild = () => { throw new Error("DOM append failed"); };
  const result = h.loadOwAdsSdk();
  await h.tick(2_000);
  await h.tick(5_000);
  assert.equal(await result, false);
  assert.equal(h.events[0].reason, "script_append_failed");
  assert.equal(h.events.at(-1).reason, "attempts_exhausted");
  h.clean();
}
{
  const h = harness();
  h.document.querySelector = () => { throw new TypeError("DOM unavailable"); };
  assert.equal(await h.loadOwAdsSdk(), false);
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].reason, "unexpected_error");
  assert.equal(h.events[0].error_type, "TypeError");
  assert.equal(h.errors.length, 1);
}

console.log("OwAds SDK checks passed: shared loads, retries, timeout, exhaustion, late success and unsupported runtime.");
