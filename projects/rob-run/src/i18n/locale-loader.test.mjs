import assert from "node:assert/strict";
import test from "node:test";
import { createLocaleLoader } from "./locale-loader.ts";
import { localeCache } from "./locale-cache.ts";

const origin = "https://locales.example";
const fingerprint = "a".repeat(24);
const channel = { version: 1, fingerprint };
const base = `${origin}/releases/${fingerprint}`;
const fallbackBaseUrl = `${origin}/releases/${"b".repeat(24)}`;
const path = "data/locales/wow-forever/frFR.json";
const pack = { version: 1, values: ["Bonjour"] };
const memoryCache = () => {
  const entries = new Map();
  return { entries, read: async (key) => entries.get(key), write: async (key, value) => { entries.set(key, value); } };
};
const offline = async () => { throw new Error("offline"); };

test("downloaded translations and channel survive a new offline session", async () => {
  const cache = memoryCache();
  const urls = [];
  const online = createLocaleLoader({ origin, fallbackBaseUrl, cache, fetchJson: async (url) => {
    urls.push(url);
    return url.endsWith("current.json") ? channel : pack;
  } });
  const result = await Promise.all([online.load(path), online.load(path)]);
  assert.deepEqual(result, [pack, pack]);
  assert.deepEqual(urls, [`${origin}/locales/wow-forever/current.json`, `${base}/${path}`]);
  const restarted = createLocaleLoader({ origin, fallbackBaseUrl, cache, fetchJson: offline });
  assert.equal(await restarted.getBase(), base);
  assert.deepEqual(await restarted.load(path), pack);
  await assert.rejects(restarted.load("data/locales/wow-forever/deDE.json"), /offline/);
});

test("a fresh install uses the pinned launch release if the channel fails", async () => {
  const urls = [];
  const loader = createLocaleLoader({ origin, fallbackBaseUrl, cache: memoryCache(), fetchJson: async (url) => {
    urls.push(url);
    if (url.endsWith("current.json")) throw new Error("channel unavailable");
    return pack;
  } });
  assert.deepEqual(await loader.load(path), pack);
  assert.equal(urls[1], `${fallbackBaseUrl}/${path}`);
});

test("a pinned locale release stays paired with its content catalog", async () => {
  const urls = [];
  const loader = createLocaleLoader({ origin, fallbackBaseUrl, preferFallbackBaseUrl: true,
    cache: memoryCache(), fetchJson: async (url) => { urls.push(url); return pack; },
  });
  assert.deepEqual(await loader.load(path), pack);
  assert.deepEqual(urls, [`${fallbackBaseUrl}/${path}`]);
});

test("a new release never reuses an older release's positional arrays", async () => {
  const cache = memoryCache();
  cache.entries.set(`${base}/${path}`, pack);
  const fingerprint = "c".repeat(24);
  const newer = { version: 1, values: ["Nouvelle traduction"] };
  const urls = [];
  const loader = createLocaleLoader({ origin, fallbackBaseUrl, cache, fetchJson: async (url) => {
    urls.push(url);
    return url.endsWith("current.json") ? { version: 1, fingerprint } : newer;
  } });
  assert.deepEqual(await loader.load(path), newer);
  assert.equal(urls[1], `${origin}/releases/${fingerprint}/${path}`);
});

test("failed downloads can be retried without restarting the app", async () => {
  let attempts = 0;
  const loader = createLocaleLoader({ origin, fallbackBaseUrl, cache: memoryCache(), fetchJson: async (url) => {
    if (url.endsWith("current.json")) return channel;
    if (++attempts === 1) throw new Error("temporary error");
    return pack;
  } });
  await assert.rejects(loader.load(path), /temporary error/);
  assert.deepEqual(await loader.load(path), pack);
  assert.equal(attempts, 2);
});

test("disabled or full storage does not block a translation download", async () => {
  const loader = createLocaleLoader({ origin, fallbackBaseUrl,
    cache: { read: offline, write: offline },
    fetchJson: async (url) => url.endsWith("current.json") ? channel : pack,
  });
  assert.deepEqual(await loader.load(path), pack);
  assert.equal(await localeCache.read("unavailable-in-node"), undefined);
  await localeCache.write("unavailable-in-node", pack);
});

test("invalid channel pointers use a validated cached channel or the launch release", async () => {
  const cache = memoryCache();
  cache.entries.set(`${origin}/locales/wow-forever/current.json`, channel);
  const loader = createLocaleLoader({ origin, fallbackBaseUrl, cache,
    fetchJson: async () => ({ version: 1, fingerprint: "../untrusted" }),
  });
  assert.equal(await loader.getBase(), base);
  cache.entries.clear();
  const fresh = createLocaleLoader({ origin, fallbackBaseUrl, cache,
    fetchJson: async () => ({ version: 2, fingerprint }),
  });
  assert.equal(await fresh.getBase(), fallbackBaseUrl);
});

test("HTTP and malformed JSON errors are retryable and never cached", async () => {
  const originalFetch = globalThis.fetch;
  let attempt = 0;
  const cache = memoryCache();
  globalThis.fetch = async (url) => {
    if (url.endsWith("current.json")) return Response.json(channel);
    attempt++;
    if (attempt === 1) return new Response("missing", { status: 404 });
    if (attempt === 2) return new Response("invalid JSON");
    if (attempt === 3) return Response.json([]);
    return Response.json(pack);
  };
  try {
    const loader = createLocaleLoader({ origin, fallbackBaseUrl, cache });
    await assert.rejects(loader.load(path), /HTTP 404/);
    await assert.rejects(loader.load(path), SyntaxError);
    await assert.rejects(loader.load(path), /Invalid locale JSON/);
    assert.equal(cache.entries.has(`${base}/${path}`), false);
    assert.deepEqual(await loader.load(path), pack);
  } finally { globalThis.fetch = originalFetch; }
});
