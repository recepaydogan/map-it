import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const entry = read("../../src/windows/uninstall/uninstall-entry.ts");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const events = compile(read("../../src/utils/analytics/events.ts"));
const surveyUrl = "https://docs.google.com/forms/d/e/test-peak-survey/viewform";
const apiKey = "phc_test_uninstall";

// Real entry and event constants, isolated from the browser, network, and app data.
async function run(options = {}) {
  const calls = { opened: [], beacons: [], fetches: [], warnings: [] };
  const open = (...args) => {
    if (options.openThrows) throw new Error("Browser unavailable");
    calls.opened.push(args);
  };
  const sandbox = {
    URL, Blob,
    localStorage: { getItem(key) {
      if (options.storageThrows) throw new Error("Storage unavailable");
      assert.equal(key, `ph_${apiKey}_posthog`);
      return options.identity === undefined ? '{"distinct_id":"existing-user"}' : options.identity;
    } },
    console: { warn: (...args) => calls.warnings.push(args) },
    navigator: { sendBeacon: options.beaconMissing ? undefined : (url, blob) => {
      if (options.beaconThrows) throw new Error("Beacon unavailable");
      calls.beacons.push({ url, blob });
      return options.beaconAccepted ?? true;
    } },
    fetch: (url, init) => {
      calls.fetches.push({ url, init });
      if (options.fetchThrows) throw new Error("Fetch unavailable");
      return options.fetchRejects ? Promise.reject(new Error("Offline")) : Promise.resolve({ ok: true });
    },
    window: { open },
    exports: {},
    require(specifier) {
      assert.equal(specifier, "../../utils/analytics/events");
      const exports = {};
      vm.runInNewContext(events, { exports });
      return exports;
    },
  };
  if (!options.browserOnly) sandbox.overwolf = { utils: { openUrlInDefaultBrowser: open } };
  const env = {
    VITE_POSTHOG_KEY: apiKey,
    VITE_POSTHOG_HOST: "https://analytics.example.test/",
    ...options.env,
  };
  const source = entry
    .replace(/const SURVEY_URL: string = .*?;/, `const SURVEY_URL: string = ${JSON.stringify(options.url ?? surveyUrl)};`)
    .replaceAll("import.meta.env", JSON.stringify(env));
  vm.runInNewContext(compile(source), sandbox);
  await Promise.resolve();
  return calls;
}

test("opens the exact Peak survey and retains the existing analytics identity", async () => {
  const calls = await run();
  assert.deepEqual(calls.opened, [[surveyUrl]]);
  assert.equal(calls.fetches.length, 0);
  assert.equal(calls.beacons.length, 1);
  assert.equal(calls.beacons[0].url, "https://analytics.example.test/capture/");
  const payload = JSON.parse(await calls.beacons[0].blob.text());
  assert.equal(payload.event, "app_uninstalled");
  assert.equal(payload.properties.distinct_id, "existing-user");
  assert.equal(payload.properties.$current_url, "peakmap-uninstall");
  assert.equal(payload.properties.surface, "uninstall");
});

test("survey does not depend on analytics being configured", async () => {
  for (const key of [undefined, "", "phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"]) {
    const calls = await run({ env: { VITE_POSTHOG_KEY: key } });
    assert.deepEqual(calls.opened, [[surveyUrl]]);
    assert.equal(calls.beacons.length + calls.fetches.length, 0);
  }
});

test("browser fallback prevents opener access", async () => {
  const calls = await run({ browserOnly: true });
  assert.deepEqual(calls.opened, [[surveyUrl, "_blank", "noopener,noreferrer"]]);
});

test("empty, placeholder, malformed and non-web URLs never open", async () => {
  for (const url of ["", "  ", "YOUR-SURVEY-URL", "not a url", "javascript:alert(1)", "file:///uninstall.html", "overwolf-extension://test/uninstall.html"]) {
    const calls = await run({ url });
    assert.equal(calls.opened.length, 0, url);
    assert.ok(calls.warnings.length > 0);
  }
});

test("refused, missing or throwing beacons fall back to keepalive", async () => {
  for (const options of [{ beaconAccepted: false }, { beaconMissing: true }, { beaconThrows: true }]) {
    const calls = await run(options);
    assert.equal(calls.fetches.length, 1);
    assert.equal(calls.fetches[0].init.keepalive, true);
    assert.equal(calls.fetches[0].init.method, "POST");
    assert.deepEqual(calls.opened, [[surveyUrl]]);
  }
});

test("failed network requests cannot prevent the survey", async () => {
  for (const options of [{ fetchThrows: true }, { fetchRejects: true }]) {
    assert.deepEqual((await run({ beaconAccepted: false, ...options })).opened, [[surveyUrl]]);
  }
});

test("missing, invalid or inaccessible identity does not block the survey", async () => {
  for (const options of [
    { identity: null }, { identity: "invalid json" }, { identity: "null" },
    { identity: '{"distinct_id":42}' }, { identity: '{"distinct_id":""}' }, { storageThrows: true },
  ]) {
    const calls = await run(options);
    assert.deepEqual(calls.opened, [[surveyUrl]]);
    assert.equal(calls.beacons.length + calls.fetches.length, 0);
  }
});

test("browser errors are contained", async () => {
  assert.ok((await run({ openThrows: true })).warnings.length > 0);
});

test("manifest and build include the invisible entry and retain platform cleanup", () => {
  const manifest = JSON.parse(read("../../public/manifest.json"));
  assert.equal(manifest.data.uninstall_window.file, "uninstall.html");
  assert.equal(manifest.data.uninstall_window.required_runtime, 1000);
  assert.notEqual(manifest.data.disable_cleanup, true);
  assert.match(read("../../uninstall.html"), /src="\/src\/windows\/uninstall\/uninstall-entry.ts"/);
  assert.match(read("../../vite.config.ts"), /uninstall: resolve\(__dirname, "uninstall.html"\)/);
  assert.doesNotMatch(entry, /posthog-js|from "react"/);
});
