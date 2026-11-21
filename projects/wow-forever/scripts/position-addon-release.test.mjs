import assert from "node:assert/strict";
import test from "node:test";
import { loadPositionAddonRuntime, preparePositionAddonRelease, publishPositionAddonRelease } from "./position-addon-release.mjs";

const { config } = await loadPositionAddonRuntime();
const prefix = new URL(config.cdnBaseUrl).pathname.slice(1);
const source = '-- test bridge\nWFM = { 1, 2, 3 }\n';

function harness() {
  const objects = new Map();
  const calls = [];
  const h = { objects, calls, badRelease: false, badChannel: false, cors: "*", writesToChannel: 0 };
  h.client = { send: async command => {
    const { Key, Body, CacheControl } = command.input;
    calls.push({ key: Key, body: Body, cacheControl: CacheControl });
    if (Body === undefined) objects.delete(Key);
    else objects.set(Key, Body);
    if (Key === `${prefix}/current.json`) h.writesToChannel++;
  } };
  h.fetcher = async url => {
    const key = new URL(url).pathname.slice(1);
    calls.push({ get: key });
    let body = objects.get(key);
    if (h.badRelease && key.includes("/releases/")) body = "tampered";
    if (h.badChannel && h.writesToChannel > 0 && key.endsWith("/current.json")) body = JSON.stringify({ schemaVersion: 1, sha256: "b".repeat(64) });
    return new Response(body ?? "not found", { status: body === undefined ? 404 : 200,
      headers: { "access-control-allow-origin": h.cors } });
  };
  h.options = { client: h.client, bucket: "fixture", baseUrl: config.cdnBaseUrl, fetcher: h.fetcher };
  return h;
}

test("release preparation normalizes source, replaces version footer and validates reader compatibility", async () => {
  const prepared = await preparePositionAddonRelease(`\uFEFF${source.replaceAll("\n", "\r\n")}\nWFM_BRIDGE_VERSION = "0.0.1"\n`, "0.1.1", 16001);
  assert.equal(prepared.addon.version, "0.1.1");
  assert.equal(prepared.addon.protocolVersion, 1);
  assert.match(prepared.addon.lua, /WFM_BRIDGE_VERSION = "0.1.1"\n$/);
  assert.equal(prepared.addon.lua.match(/WFM_BRIDGE_VERSION/g).length, 1);
  await assert.rejects(preparePositionAddonRelease(source, "1.0\nfile.lua", 16001));
  await assert.rejects(preparePositionAddonRelease(" ", "0.1.1", 16001));
  await assert.rejects(preparePositionAddonRelease(source, "0.1.1", 0));
});

test("publication verifies immutable payload before making channel visible", async () => {
  const h = harness();
  const release = await preparePositionAddonRelease(source, "0.1.1", 16001);
  assert.equal((await publishPositionAddonRelease(release, h.options)).changed, true);
  const writes = h.calls.filter(call => call.key);
  assert.equal(writes[0].key, `${prefix}/releases/${release.sha256}.json`);
  assert.equal(writes[0].cacheControl, "public, max-age=31536000, immutable");
  assert.equal(writes[1].key, `${prefix}/current.json`);
  assert.equal(writes[1].cacheControl, "no-store");
  assert.ok(h.calls.findIndex(call => call.get === writes[0].key) < h.calls.findIndex(call => call.key === writes[1].key));
  assert.equal(JSON.parse(h.objects.get(`${prefix}/current.json`)).sha256, release.sha256);
});

test("updating backs up prior channel and publishing the same release is idempotent", async () => {
  const h = harness();
  const old = await preparePositionAddonRelease(source, "0.1.0", 16001);
  const next = await preparePositionAddonRelease(source, "0.1.1", 16001);
  await publishPositionAddonRelease(old, h.options);
  await publishPositionAddonRelease(next, h.options);
  const backup = [...h.objects].find(([key]) => key.includes("/history/"));
  assert.equal(JSON.parse(backup[1]).sha256, old.sha256);
  assert.equal((await publishPositionAddonRelease(next, h.options)).changed, false);
});

test("bad public payload/CORS cannot switch the channel", async () => {
  for (const defect of ["badRelease", "cors"]) {
    const h = harness();
    const release = await preparePositionAddonRelease(source, "0.1.1", 16001);
    h[defect] = defect === "cors" ? "https://unrelated.example" : true;
    await assert.rejects(publishPositionAddonRelease(release, h.options));
    assert.equal(h.objects.has(`${prefix}/current.json`), false);
  }
});

test("failed channel verification restores the previous pointer", async () => {
  const h = harness();
  const old = await preparePositionAddonRelease(source, "0.1.0", 16001);
  await publishPositionAddonRelease(old, h.options);
  h.writesToChannel = 0;
  h.badChannel = true;
  const next = await preparePositionAddonRelease(source, "0.1.1", 16001);
  await assert.rejects(publishPositionAddonRelease(next, h.options), /previous channel restored/);
  assert.equal(JSON.parse(h.objects.get(`${prefix}/current.json`)).sha256, old.sha256);
});

test("a failed first publication removes the unverified channel", async () => {
  const h = harness();
  h.badChannel = true;
  const next = await preparePositionAddonRelease(source, "0.1.1", 16001);
  await assert.rejects(publishPositionAddonRelease(next, h.options), /previous channel restored/);
  assert.equal(h.objects.has(`${prefix}/current.json`), false);
});
