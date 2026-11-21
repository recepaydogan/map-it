import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const bundled = await build({
  entryPoints: [fileURLToPath(new URL("./subscription-callback.ts", import.meta.url))],
  bundle: true, write: false, format: "esm", platform: "node",
  define: { "import.meta.env.VITE_TEBEX_PUBLIC_TOKEN": '"test-store"' },
});
const { startSubscriptionCallbackRelay, SUBSCRIPTION_CALLBACK_KEY } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`,
);

function harness(t, search = "") {
  const listeners = new Set();
  const writes = [];
  for (const [key, value] of Object.entries({
    window: { location: { search } },
    localStorage: { setItem: (key, value) => writes.push({ key, value: JSON.parse(value) }) },
    overwolf: { extensions: { onAppLaunchTriggered: {
      addListener: callback => listeners.add(callback), removeListener: callback => listeners.delete(callback),
    } } },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  const stop = startSubscriptionCallbackRelay();
  return { writes, stop, listeners, launch: parameter => {
    for (const callback of listeners) callback({ origin: "urlscheme", parameter });
  } };
}

test("relays the exact encoded success callback observed in Overwolf logs", t => {
  const h = harness(t);
  h.launch("valheimmap%3a%2f%2f%2f%3fresult%3dsuccess");
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].key, SUBSCRIPTION_CALLBACK_KEY);
  assert.equal(h.writes[0].value.result, "success");
  assert.deepEqual(Object.keys(h.writes[0].value).sort(), ["result", "time"]);
  h.stop();
  assert.equal(h.listeners.size, 0);
});

test("supports plain callbacks and encoded cancellation", t => {
  const h = harness(t);
  h.launch("valheimmap://?result=success");
  h.launch(encodeURIComponent("valheimmap:///?result=cancel"));
  assert.deepEqual(h.writes.map(w => w.value.result), ["success", "cancel"]);
});

test("recovers checkout on a cold urlscheme launch", t => {
  const h = harness(t, "?source=urlscheme&valheimmap%3a%2f%2f%2f%3fresult%3dsuccess");
  assert.deepEqual(h.writes.map(w => w.value.result), ["success"]);
});

test("ignores unrelated, invalid and malformed callbacks", t => {
  const h = harness(t, "?source=commandline&valheimmap%3a%2f%2f%3fresult%3dsuccess");
  for (const parameter of ["", "%ZZ", "https://example.com/?result=success", "otherapp://?result=success", "valheimmap://?result=pending"])
    h.launch(parameter);
  assert.equal(h.writes.length, 0);
});
