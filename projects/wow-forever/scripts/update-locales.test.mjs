import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (language) => JSON.parse(await readFile(join(root, `src/i18n/locales/${language}.json`), "utf8"));
const english = (await read("en")).updates;
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];

function verify(source, translated, path = []) {
  const location = path.join(".");
  if (typeof source === "string") {
    assert.equal(typeof translated, "string", location);
    assert.ok(!translated.includes("{{CLIENT:"), location);
    assert.ok(!translated.includes("{{ENTITY:"), location);
    assert.ok(!translated.includes("{{PFITEM:"), location);
    const variables = (value) => [...value.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(variables(translated), variables(source), location);
    if (["target", "categoryId"].includes(path.at(-1)) ||
      path.includes("releases") && path.at(-1) === "version") {
      assert.equal(translated, source, location);
    }
    return;
  }
  if (path.at(-1) === "parts" && Array.isArray(source)) {
    // Word order and text segmentation differ by language; link destinations must not.
    assert.ok(Array.isArray(translated) && translated.length > 0, location);
    for (const part of translated) {
      assert.ok(part && typeof part.text === "string", location);
      if (part.target) assert.ok(part.text.trim(), location);
    }
    assert.ok(translated.map(part => part.text).join("").trim(), location);
    const links = parts => parts.map(({ text, ...metadata }) => metadata)
      .filter(metadata => Object.keys(metadata).length)
      .map(metadata => JSON.stringify(Object.fromEntries(Object.entries(metadata).sort())))
      .sort();
    assert.deepEqual(links(translated), links(source), location);
    verify(source.map(part => part.text).join(""), translated.map(part => part.text).join(""), [...path, "text"]);
    return;
  }
  assert.equal(Array.isArray(translated), Array.isArray(source), location);
  assert.deepEqual(Object.keys(translated).sort(), Object.keys(source).sort(), location);
  for (const [key, value] of Object.entries(source)) verify(value, translated[key], [...path, key]);
}

test("localized note parts allow different word order while preserving links and variables", () => {
  const source = [{ text: "Open " }, { text: "Dungeons", target: "dungeons" }, { text: " for {{count}} runs." }];
  const translated = [{ text: "던전", target: "dungeons" }, { text: "에서 {{count}}회 공략을 준비하세요." }];
  verify(source, translated, ["parts"]);
  assert.throws(() => verify(source, [{ text: "{{count}}" }], ["parts"]));
  assert.throws(() => verify(source, [{ text: "던전", target: "dungeons" }], ["parts"]));
});

test("all release notes keep their links and have complete localized prose", async () => {
  for (const language of languages) {
    const localized = (await read(language)).updates;
    verify(english, localized, [language, "updates"]);
    for (const [version, release] of Object.entries(localized.releases)) {
      for (const [index, note] of release.items.entries()) {
        const text = typeof note === "string" ? note : JSON.stringify(note);
        assert.ok(text.trim(), `${language}/${version}/${index}`);
      }
    }
  }
});

test("release notes reuse the reviewed Sparring Match quest title", async () => {
  for (const language of ["ko", "zh-Hans", "zh-Hant"]) {
    const locale = await read(language);
    assert.equal(locale.updates.releases.v422.items[8].parts[1].text,
      locale.map.questMarkers["1015614"].name, language);
  }
});

test("release notes reuse exact NPC fallbacks when the client name is absent", async () => {
  const fallbacks = JSON.parse(await readFile(join(root,
    "public/data/locales/wow-forever/map-entity-app-fallbacks.json"), "utf8"));
  for (const [language, gameLocale] of [["ko", "koKR"], ["zh-Hans", "zhCN"], ["zh-Hant", "zhTW"]]) {
    const locale = await read(language);
    assert.equal(locale.updates.releases.v430.items[4].parts[1].text,
      fallbacks.locales[gameLocale]["Creature:254775:0"], language);
    assert.equal(locale.updates.releases.v432.items[3].parts[1].text,
      fallbacks.locales[gameLocale]["Creature:256410:0"], language);
    if (language !== "ko") {
      assert.equal(locale.updates.releases.v432.items[4].parts[3].text,
        fallbacks.locales[gameLocale]["Creature:240482:0"], language);
    }
  }
});

test("Berdun's release note name matches the localized map entity", async () => {
  const source = JSON.parse(await readFile(join(root,
    "public/data/locales/wow-forever/map-entity-source.json"), "utf8"));
  const fallbacks = JSON.parse(await readFile(join(root,
    "public/data/locales/wow-forever/map-entity-app-fallbacks.json"), "utf8"));
  const entityKey = "Creature:240482:0";
  const index = source.keys.indexOf(entityKey);
  assert.ok(index >= 0);
  for (const [language, gameLocale] of [
    ["de", "deDE"], ["es", "esES"], ["es-MX", "esMX"], ["fr", "frFR"],
    ["ko", "koKR"], ["pt-BR", "ptBR"], ["zh-Hans", "zhCN"], ["zh-Hant", "zhTW"],
  ]) {
    const pack = JSON.parse(await readFile(join(root,
      `public/data/locales/wow-forever/map-entity-${gameLocale}.json`), "utf8"));
    const expected = pack.values[index] ?? fallbacks.locales[gameLocale]?.[entityKey];
    assert.ok(expected, language);
    assert.equal((await read(language)).updates.releases.v432.items[4].parts[3].text,
      expected, language);
  }
});

test("raid names in release notes match the localized client item description", async () => {
  const source = JSON.parse(await readFile(join(root,
    "public/data/locales/wow-forever/source.json"), "utf8"));
  const index = source.keys.indexOf("ItemSparse:274030:0");
  assert.ok(index >= 0);
  const names = {
    de: ["Tiefengrabhügel", "Hyjalgipfel"],
    es: ["Cavernas del Túmulo", "Cima Hyjal"],
    "es-MX": ["Cavernas del Túmulo", "Cima Hyjal"],
    fr: ["profondeurs des Saisons", "sommet d’Hyjal"],
    ko: ["지하굴", "하이잘 정상"],
    "pt-BR": ["Profundezas Tumulares", "Pico Hyjal"],
    "zh-Hans": ["深穴", "海加尔峰"],
    "zh-Hant": ["地深獸穴", "海加爾山之巔"],
  };
  const gameLocales = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
    ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
  for (const [language, localizedNames] of Object.entries(names)) {
    const client = JSON.parse(await readFile(join(root,
      `public/data/locales/wow-forever/${gameLocales[language]}.json`), "utf8"));
    const note = (await read(language)).updates.releases.v432.items[4].parts[8].text;
    for (const name of localizedNames) {
      assert.ok(client.values[index].includes(name), `${language}: client ${name}`);
      assert.ok(note.includes(name), `${language}: release note ${name}`);
    }
    assert.ok(!note.includes("Barrow Deeps") && !note.includes("Hyjal Summit"), language);
  }
});
