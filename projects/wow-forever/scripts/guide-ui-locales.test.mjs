import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../src/i18n/locales/", import.meta.url);
const read = async (locale) => JSON.parse(await readFile(new URL(`${locale}.json`, root), "utf8"));
const codes = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];

function leaves(value, prefix = "") {
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof entry === "string" ? [[path, entry]] : leaves(entry, path);
  });
}

test("staged guide and race UI translations preserve keys and interpolation variables", async () => {
  const source = await read("en");
  for (const group of ["guides", "races"]) {
    const english = new Map(leaves(source[group]));
    for (const locale of codes) {
      const translated = new Map(leaves((await read(locale))[group]));
      assert.deepEqual([...translated.keys()].sort(), [...english.keys()].sort(), `${locale}: ${group}`);
      for (const [key, value] of translated) {
        assert.ok(value.trim(), `${locale}: ${group}.${key} is empty`);
        const variables = (text) => [...text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)]
          .map((match) => match[1]).sort();
        assert.deepEqual(variables(value), variables(english.get(key)), `${locale}: ${group}.${key}`);
      }
    }
  }
});

test("guide navigation links have localized labels or canonical class names", async () => {
  const guideRoot = new URL("../public/data/guides/", import.meta.url);
  const files = (await readdir(guideRoot)).filter((file) =>
    file.endsWith(".json") && file !== "index.json");
  const anchors = (html) => [...html.matchAll(
    /<a\b[^>]*data-guide-link="((?:guide|race|class|map-view):[^"]*)"[^>]*>([^<]*)<\/a>/g)]
    .map((match) => [match[1], match[2]]);
  for (const language of codes) {
    const locale = await read(language);
    for (const file of files) {
      const source = JSON.parse(await readFile(new URL(file, guideRoot), "utf8"));
      const translated = JSON.parse(await readFile(new URL(
        `../public/data/guides/locales/${language}/${file}`, import.meta.url), "utf8"));
      const englishLinks = anchors(source.html);
      const localizedLinks = anchors(translated.html);
      assert.deepEqual(localizedLinks.map(([target]) => target),
        englishLinks.map(([target]) => target), `${language}/${file}: navigation targets`);
      for (const [index, [target, englishLabel]] of englishLinks.entries()) {
        const label = localizedLinks[index][1];
        if (label !== englishLabel || !label.trim()) continue;
        const [, classId, tab] = target.split(":");
        assert.ok(target.startsWith("class:") && classId && !tab &&
          locale.map.characters.classNames[classId] === label,
        `${language}/${file}: unchanged English navigation label ${target}: ${label}`);
      }
    }
  }
});

test("localized guides keep generic race and mount prose in the selected language", async () => {
  const guideRoot = new URL("../public/data/guides/locales/", import.meta.url);
  for (const language of codes) {
    const directory = new URL(`${language}/`, guideRoot);
    for (const file of await readdir(directory)) {
      if (file === "index.json" || !file.endsWith(".json")) continue;
      const guide = JSON.parse(await readFile(new URL(file, directory), "utf8"));
      const prose = guide.html.replace(/<[^>]+>/g, " ")
        .replaceAll("Meet the New Skyborne", "")
        .replaceAll("Skyborne Heroic Pack", "");
      assert.ok(!/\bSkyborne\b/.test(prose), `${language}/${file}: untranslated race name`);
      assert.ok(!/\bGalestrider\b/.test(prose), `${language}/${file}: untranslated mount name`);
    }
  }
});

test("localized guide prose uses reviewed client spell, item and area names", async () => {
  const guideRoot = new URL("../public/data/guides/locales/", import.meta.url);
  const gameNames = [
    "Etched Note", "Shield Bash", "Tame Beast", "Sniper Shot", "Furious Howl",
    "Curse of Agony", "Two-Handed Axes and Maces", "Shredding Attacks",
    "Hot Streak", "Sonic Blast", "Shifting Power", "Lake Elune'ara",
  ];
  const exceptions = {
    de: ["Thunder Bluff", "Improved Scorch"],
    es: ["Tome of the Cabal"],
    "es-MX": ["Devouring Plague"],
    fr: ["Thunder Bluff", "Silverpine Forest", "Darkshore"],
    ko: ["Auberdine", "Darkshore", "Southshore", "Valanaar", "Dwarf", "Gnome", "Tauren"],
    "pt-BR": ["Desperate Prayer", "Arcane Feedback"],
    "zh-Hans": ["Auberdine", "Darkshore", "Southshore", "Valanaar", "Dwarf", "Gnome", "Tauren"],
    "zh-Hant": ["Auberdine", "Darkshore", "Southshore", "Valanaar", "Dwarf", "Gnome", "Tauren"],
  };
  for (const language of codes) {
    const directory = new URL(`${language}/`, guideRoot);
    for (const file of await readdir(directory)) {
      if (file === "index.json" || !file.endsWith(".json")) continue;
      const guide = JSON.parse(await readFile(new URL(file, directory), "utf8"));
      const prose = guide.html.replace(/<[^>]+>/g, " ");
      for (const english of [...gameNames, ...(exceptions[language] ?? [])]) {
        assert.ok(!prose.includes(english), `${language}/${file}: untranslated ${english}`);
      }
    }
  }
});

test("racial spell links use their current client names in every guide", async () => {
  const base = new URL("../public/data/locales/wow-forever/", import.meta.url);
  const source = JSON.parse(await readFile(new URL("source.json", base), "utf8"));
  const gameCodes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
    ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
  const spellIds = [20597, 1259719, 20574, 1259705];
  for (const [language, code] of Object.entries(gameCodes)) {
    const locale = JSON.parse(await readFile(new URL(`${code}.json`, base), "utf8"));
    const directory = new URL(`../public/data/guides/locales/${language}/`, import.meta.url);
    for (const file of await readdir(directory)) {
      if (file === "index.json" || !file.endsWith(".json")) continue;
      const guide = JSON.parse(await readFile(new URL(file, directory), "utf8"));
      for (const id of spellIds) {
        const index = source.keys.indexOf(`SpellName:${id}:0`);
        assert.ok(index >= 0, `missing source spell ${id}`);
        const expected = locale.values[index];
        for (const match of guide.html.matchAll(new RegExp(`data-guide-link="spell:${id}">([^<]+)</a>`, "g"))) {
          assert.equal(match[1], expected, `${language}/${file}: spell ${id}`);
        }
      }
    }
  }
});

test("localized guides do not retain five-word English prose", async () => {
  const guideRoot = new URL("../public/data/guides/", import.meta.url);
  const files = (await readdir(guideRoot)).filter((file) =>
    file.endsWith(".json") && file !== "index.json");
  const visible = (html) => html.replace(/<[^>]+>/g, " ");
  const reviewedNames = [
    "Choose Your Ruleset in World of Warcraft",
    "Meet the New Skyborne",
    "Auto-shoot Bug and Fix Incoming",
    "Thorgas Grimson in Dun Morogh",
  ];
  const stopwords = new Set(["the", "of", "and", "to", "for", "with", "from", "in",
    "on", "your", "you", "when", "after", "before", "while", "at", "a", "an"]);
  for (const file of files) {
    const original = JSON.parse(await readFile(new URL(file, guideRoot), "utf8"));
    const words = visible(original.html).match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
    const phrases = new Set();
    for (let index = 0; index + 5 <= words.length; index += 1) {
      const slice = words.slice(index, index + 5);
      if (slice.some((word) => stopwords.has(word.toLowerCase()))) phrases.add(slice.join(" "));
    }
    for (const language of codes) {
      const guide = JSON.parse(await readFile(new URL(
        `../public/data/guides/locales/${language}/${file}`, import.meta.url), "utf8"));
      let prose = visible(guide.html);
      for (const name of reviewedNames) prose = prose.replaceAll(name, "");
      for (const phrase of phrases) {
        assert.ok(!prose.includes(phrase), `${language}/${file}: English prose ${phrase}`);
      }
    }
  }
});
