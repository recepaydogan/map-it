import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../src/components/ads/ad-telemetry.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness() {
  const events = [], warnings = [], instances = [];
  const context = {
    exports: {}, navigator: { onLine: false },
    console: { warn: (...args) => warnings.push(args) },
    require: () => ({ track: (event, props) => events.push({ event, ...props }) }),
    window: { OwAd: class {
      version = "test-sdk";
      listeners = new Map();
      constructor(container, options) { this.container = container; this.options = options; instances.push(this); }
      addEventListener(name, callback) { this.listeners.set(name, callback); return true; }
      removeEventListener(name, callback) { assert.equal(this.listeners.get(name), callback); this.listeners.delete(name); }
    } },
  };
  vm.runInNewContext(code, context);
  return { ...context.exports, context, events, warnings, instances };
}

// Observe both placements, bound repeated SDK events, and detach on cleanup.
{
  const h = harness();
  for (const containerId of ["gm_lg_overlay", "gm_top_overlay"]) {
    const container = {}, options = { containerId, size: { width: 400, height: 600 } };
    const { ad, disposeDiagnostics } = h.createObservedAd(container, options);
    assert.equal(ad.container, container);
    assert.equal(ad.options, options);
    for (let i = 0; i < 8; i++) ad.listeners.get("error")({ code: 301, url: "private-ad-url", message: "private-payload" });
    disposeDiagnostics();
    disposeDiagnostics();
    assert.equal(ad.listeners.size, 0);
    h.createObservedAd(container, options).disposeDiagnostics();
  }
  assert.equal(h.events.filter(e => e.event === "AD_CONTAINER_CREATED").length, 2);
  assert.equal(h.events.filter(e => e.event === "AD_CONTAINER_ERROR").length, 6);
  assert.ok(h.events.filter(e => e.event === "AD_CONTAINER_ERROR").every(e => e.error_code === 301 && e.stage === "video_load"));
  assert.ok(h.events.every(e => e.online === false));
  assert.ok(!JSON.stringify(h.events).includes("private-"));
}

// Preserve the original constructor failure after reporting it, once per attempt (capped).
{
  const h = harness(), error = new TypeError("private failure detail");
  h.context.window.OwAd = class { constructor() { throw error; } };
  assert.throws(() => h.createObservedAd({}, { containerId: "gm_lg_desktop" }), e => e === error);
  assert.equal(h.events[0].stage, "constructor");
  assert.equal(h.events[0].error_type, "TypeError");
  assert.ok(!JSON.stringify(h.events).includes("private"));
}

// Analytics failures and unavailable SDK error listeners must not break ad creation.
{
  const h = harness();
  h.context.require = () => ({ track() { throw new Error("analytics blocked"); } });
  // The imported module object is captured by CommonJS; load a fresh instance.
  const context = { ...h.context, exports: {} };
  vm.runInNewContext(code, context);
  const observed = context.exports.createObservedAd({}, { containerId: "gm_top_desktop" });
  assert.ok(observed.ad);
  observed.disposeDiagnostics();
  assert.equal(h.warnings.length, 1);
}
{
  const h = harness();
  h.context.window.OwAd.prototype.addEventListener = () => { throw new Error("unsupported event"); };
  const observed = h.createObservedAd({}, { containerId: "gm_lg_desktop" });
  observed.disposeDiagnostics();
  assert.ok(observed.ad);
  assert.equal(h.events.at(-1).reason, "listener_threw");
}
{
  const h = harness();
  h.context.window.OwAd.prototype.addEventListener = () => false;
  const observed = h.createObservedAd({}, { containerId: "gm_lg_desktop" });
  observed.disposeDiagnostics();
  assert.equal(h.events.at(-1).reason, "listener_rejected");
}
console.log("Ad diagnostics preserve constructors, cap duplicates, remove listeners and isolate analytics failures.");
