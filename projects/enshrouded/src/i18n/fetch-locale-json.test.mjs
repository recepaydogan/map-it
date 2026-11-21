import assert from "node:assert/strict";
import test from "node:test";
import { fetchLocaleJson, validateAppLocalePack } from "./fetch-locale-json.ts";

test("locale delivery uses the selected CDN and retains a bundled offline fallback", async () => {
  const calls = [];
  const value = await fetchLocaleJson("https://cdn.example/tr.json", "/data/tr.json", async url => {
    calls.push(url);
    if (url.startsWith("https:")) throw new TypeError("Offline");
    return Response.json({ translated: "Türkçe" });
  });
  assert.deepEqual(calls, ["https://cdn.example/tr.json", "/data/tr.json"]);
  assert.deepEqual(value, { translated: "Türkçe" });
});

test("successful CDN delivery avoids a second fetch; invalid JSON cannot replace bundled text", async () => {
  const calls = [];
  await fetchLocaleJson("https://cdn.example/tr.json", "/data/tr.json", async url => {
    calls.push(url);
    return Response.json({ language: "tr" });
  });
  assert.equal(calls.length, 1);
  const fallback = await fetchLocaleJson("https://cdn.example/tr.json", "/data/tr.json", async url =>
    url.startsWith("https:") ? new Response("broken json") : Response.json({ language: "tr" }));
  assert.equal(fallback.language, "tr");
  await assert.rejects(fetchLocaleJson("/same.json", "/same.json", async () => new Response("", { status: 404 })), AggregateError);
});

test("app locale identity and English-source alignment are checked before installation", () => {
  const pack = { version: 1, language: "tr", sourceSha256: "current", translation: { settings: { title: "Ayarlar" } } };
  assert.deepEqual(validateAppLocalePack(pack, "tr", "current"), pack.translation);
  assert.throws(() => validateAppLocalePack(pack, "fr", "current"));
  assert.throws(() => validateAppLocalePack(pack, "tr", "stale"));
});
