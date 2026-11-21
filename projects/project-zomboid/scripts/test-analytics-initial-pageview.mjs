import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const calls = [];
const posthog = {
  init: () => calls.push(["init"]),
  capture: (event, properties) => calls.push(["capture", event, properties]),
  identify: (id) => calls.push(["identify", id]),
  reset: () => calls.push(["reset"]),
};

const source = readFileSync(new URL("../src/services/analytics/analytics.ts", import.meta.url), "utf8")
  .replaceAll("import.meta.env.VITE_POSTHOG_KEY", '"phc_test"')
  .replaceAll("import.meta.env.VITE_POSTHOG_HOST", '"https://eu.i.posthog.com"')
  .replaceAll("import.meta.env.VITE_POSTHOG_UI_HOST", "undefined");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
runInNewContext(compiled, {
  exports,
  require: (id) => {
    if (id === "posthog-js") return { default: posthog };
    if (id === "./app-context") {
      return {
        readScreenContext: async () => ({ screen_count: 1 }),
        readAppVersion: async () => "test",
      };
    }
    throw new Error(`Unexpected dependency: ${id}`);
  },
  setTimeout: () => 0,
  console,
});

exports.capturePageview("/map", { map: "knox-country" });
exports.capturePageview("/map", { map: "knox-country" });
exports.identifyUser("user-1");
exports.track("app_opened");
assert.equal(calls.length, 0, "events should wait for initialization");

exports.initAnalytics("desktop");
await new Promise((resolve) => setImmediate(resolve));

assert.equal(calls.filter(([kind]) => kind === "init").length, 1);
assert.equal(calls.filter(([kind, event]) => kind === "capture" && event === "$pageview").length, 1);
assert.equal(calls.find(([kind]) => kind === "identify")?.[1], "user-1");
assert.equal(calls.find(([kind, event]) => kind === "capture" && event === "$pageview")?.[2].surface, "desktop");
assert.equal(calls.find(([kind, event]) => kind === "capture" && event === "app_opened")?.[2].screen_count, 1);

console.log("Initial analytics events survive child-before-parent React effects.");
