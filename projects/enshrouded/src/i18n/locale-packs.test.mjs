import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createGameDictionary, getDictionaryText } from "./game-dictionary.ts";

const root = new URL("../../", import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), "utf8").replace(/^\uFEFF/, ""));
const languages = read("scripts/enshrouded-languages.json");
const gameSource = read("public/data/enshrouded/locales/source.json");
const inventory = read("research/localization/content-inventory.json");

test("the official game export contains all installed languages with aligned nonempty tags", () => {
  const manifest = read("public/data/enshrouded/locales/manifest.json");
  assert.deepEqual(Object.keys(manifest.languages).sort(), Object.keys(languages).sort());
  assert.equal(new Set(gameSource.keys).size, gameSource.keys.length);
  for (const [code, gameCode] of Object.entries(languages)) {
    const pack = read(`public/data/enshrouded/locales/${gameCode.replaceAll("_", "-").toLowerCase()}.json`);
    assert.equal(pack.sourceSha256, gameSource.sourceSha256, code);
    assert.equal(pack.values.length, gameSource.keys.length, code);
    // The game's comma-only tag intentionally becomes a space in ru/pl.
    // Preserve that formatting record; meaningful text must remain nonempty.
    assert.ok(pack.values.every((value, index) => typeof value === "string"
      && (!/[\p{L}\p{N}]/u.test(gameSource.values[index]) || value.trim())), code);
    assert.equal(manifest.languages[code].missingSourceTags, 0, code);
    createGameDictionary(gameSource, pack);
  }
});

test("the official Turkish glossary resolves known game meanings instead of literal translations", () => {
  const dictionary = createGameDictionary(gameSource, read("public/data/enshrouded/locales/tr-tr.json"));
  assert.equal(getDictionaryText(dictionary, "Shroud", "302477978"), "Pus");
  assert.equal(getDictionaryText(dictionary, "Ancient Spire", "445222884"), "Kadim Kule");
  assert.equal(getDictionaryText(dictionary, "Mine", "3820022214"), "Maden");
  assert.equal(getDictionaryText(dictionary, "Mine", "562596189"), "Kaz");
});

test("localization preserves authored content, entity IDs, recipes and navigation targets", () => {
  for (const [path, entry] of Object.entries(inventory.catalogs)) {
    const actual = createHash("sha256").update(readFileSync(new URL(path, root))).digest("hex");
    assert.equal(actual, entry.sha256, `Source catalog changed during localization: ${path}`);
  }
});

// This is a release gate: partial language files or English fallbacks cannot
// be counted as complete coverage simply because the UI key tests are green.
test("every supplemental display string has a current translation in all target languages", () => {
  const source = read("public/data/enshrouded/content-locales/source.json");
  const covered = new Set(source.values);
  for (const entry of inventory.strings) {
    assert.ok(covered.has(entry.english), `Uninventoried display text: ${entry.english.slice(0, 100)}`);
  }
  const tokens = value => [...value.matchAll(/\{\{[^{}]*\}\}|\[\[[^\]]*\]\]/g)].map(match => match[0]).sort();
  for (const code of Object.keys(languages).filter(code => code !== "en")) {
    const pack = read(`public/data/enshrouded/content-locales/${code.toLowerCase()}.json`);
    assert.equal(pack.sourceSha256, source.sourceSha256, code);
    assert.equal(pack.values.length, source.values.length, code);
    for (let i = 0; i < source.values.length; i++) {
      const value = pack.values[i];
      assert.ok(typeof value === "string" && value.trim(), `${code}:${source.keys[i]}`);
      assert.doesNotMatch(value, /__EM_|ZXQ|QXZ|\bZX[A-Z0-9 ]{5,50}QZ\b|\{\{EMTERM_\d+\}\}|\uFFFD/i);
      assert.deepEqual(tokens(value), tokens(source.values[i]), `Changed links or interpolation ${code}:${source.keys[i]}`);
    }
    createGameDictionary(source, pack);
  }
});

test("the current full-content audit has no missing provenance or unresolved authored-text candidates", () => {
  const source = read("public/data/enshrouded/content-locales/source.json");
  const status = read("research/localization/status.json");
  assert.equal(status.content.sourceSha256, source.sourceSha256);
  assert.equal(status.content.translated, true, "Run the complete content audit and resolve its per-language findings");
  assert.equal(Object.keys(status.content.packs).length, Object.keys(languages).length - 1);
});

test("all CDN UI payloads exactly match the bundled reviewed translations and manifest hashes", () => {
  const manifest = read("public/data/enshrouded/app-locales/manifest.json");
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  assert.equal(manifest.sourceSha256, sha(readFileSync(new URL("src/i18n/locales/en.json", root))));
  assert.deepEqual(Object.keys(manifest.languages).sort(), Object.keys(languages).sort());
  for (const [code, entry] of Object.entries(manifest.languages)) {
    const bytes = readFileSync(new URL(`public/data/enshrouded/app-locales/${entry.file}`, root));
    const pack = JSON.parse(bytes.toString("utf8"));
    assert.equal(bytes.length, entry.size, code);
    assert.equal(sha(bytes), entry.sha256, code);
    assert.equal(pack.language, code);
    assert.equal(pack.sourceSha256, manifest.sourceSha256);
    assert.deepEqual(pack.translation, read(`src/i18n/locales/${code.toLowerCase()}.json`));
  }
});

test("reviewed native defects are repaired in display text without modifying the official game export", () => {
  const source = read("public/data/enshrouded/content-locales/source.json");
  const uk = read("public/data/enshrouded/content-locales/uk.json");
  const ja = read("public/data/enshrouded/content-locales/ja.json");
  const th = read("public/data/enshrouded/content-locales/th.json");
  assert.equal(uk.values[source.values.indexOf("Bembel Pitcher")], "Глечик «Бембель»");
  assert.equal(ja.values[source.values.indexOf("Commo")], "コモン");
  for (const [i, english] of source.values.entries()) {
    if (/Veilwater/i.test(english)) assert.doesNotMatch(uk.values[i], /сира земля/i);
    assert.doesNotMatch(th.values[i], /\[mq:ch\s+val=/i);
  }
  const nativeUk = read("public/data/enshrouded/locales/uk-ua.json");
  const nativeIndex = gameSource.values.indexOf("Bembel Pitcher");
  assert.equal(nativeUk.values[nativeIndex], "Bembel Sürahi", "Preserve the authoritative raw game record");
});
