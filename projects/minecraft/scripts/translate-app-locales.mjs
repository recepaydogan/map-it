import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GAME_GUIDE_LANGUAGE_SOURCE } from "../src/game-config.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDirectory, "..");
const localeDirectory = join(projectRoot, "src", "i18n", "locales");
const source = JSON.parse(await readFile(join(localeDirectory, "en.json"), "utf8"));

const languages = {
  "zh-Hans": "zh-CN",
  "hi-IN": "hi",
  es: "es",
  fr: "fr",
  "pt-BR": "pt-BR",
};
assert.deepEqual(
  Object.keys(languages).sort(),
  Object.keys(GAME_GUIDE_LANGUAGE_SOURCE.localeCodes).filter((locale) => locale !== "en").sort(),
  "Translation targets must match supported app languages.",
);

const allEntries = [];
const collectStrings = (value, path = []) => {
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") allEntries.push({ path: [...path, key], value: child });
    else collectStrings(child, [...path, key]);
  }
};
collectStrings(source);
const requestedKeys = process.argv.find((argument) => argument.startsWith("--keys="))?.slice("--keys=".length).split(",");
const entries = requestedKeys
  ? allEntries.filter(({ path }) => requestedKeys.includes(path.join(".")))
  : allEntries;

const chunks = [];
for (let index = 0; index < entries.length; index += 45) {
  chunks.push(entries.slice(index, index + 45));
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const protectedTerms = /{{.*?}}|Overwolf|Discord|Google/g;
const contextualSourceByKey = {};

const translateChunk = async (target, chunk, attempt = 1) => {
  const query = chunk
    .map(({ value }, index) => {
      let fragmentIndex = 0;
      const contextualValue = contextualSourceByKey[chunk[index].path.join(".")] ?? value;
      const protectedValue = contextualValue.replace(protectedTerms, () => `<x id="${String.fromCharCode(65 + fragmentIndex++)}"/>`);
      return `__GM_${String(index).padStart(4, "0")}__\n${protectedValue}`;
    })
    .join("\n");
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  for (const [key, value] of Object.entries({ client: "gtx", sl: "en", tl: target, dt: "t", q: query })) {
    url.searchParams.set(key, value);
  }

  try {
    const response = await fetch(url, { headers: { "User-Agent": "Game Companion locale generator" } });
    if (!response.ok) throw new Error(`Translation request failed with ${response.status}.`);
    const payload = await response.json();
    const translated = payload[0].map((segment) => segment[0]).join("");
    const results = new Map();
    const marker = /__GM_(\d{4})__\s*([\s\S]*?)(?=__GM_\d{4}__|$)/g;
    for (const match of translated.matchAll(marker)) {
      results.set(Number(match[1]), match[2].trim());
    }
    if (results.size !== chunk.length) {
      throw new Error(`Expected ${chunk.length} translated strings, received ${results.size}.`);
    }
    return chunk.map((entry, index) => {
      const contextualValue = contextualSourceByKey[entry.path.join(".")] ?? entry.value;
      const originalFragments = contextualValue.match(protectedTerms) ?? [];
      const value = results.get(index).replace(/<x\s+id\s*=\s*"([A-Z])"\s*\/>/g, (_, placeholderLetter) => originalFragments[placeholderLetter.charCodeAt(0) - 65]);
      return { ...entry, value };
    });
  } catch (error) {
    if (attempt >= 6) throw error;
    await wait(4_000 * 2 ** attempt);
    return translateChunk(target, chunk, attempt + 1);
  }
};

const setAtPath = (root, path, value) => {
  let current = root;
  for (const key of path.slice(0, -1)) {
    if (!current[key] || typeof current[key] !== "object") current[key] = {};
    current = current[key];
  }
  current[path.at(-1)] = value;
};

const pruneUnknownKeys = (translation, template) => {
  for (const key of Object.keys(translation)) {
    if (!(key in template)) {
      delete translation[key];
      continue;
    }
    if (
      translation[key]
      && template[key]
      && typeof translation[key] === "object"
      && typeof template[key] === "object"
      && !Array.isArray(translation[key])
      && !Array.isArray(template[key])
    ) {
      pruneUnknownKeys(translation[key], template[key]);
    }
  }
};

const placeholders = (value) => [...value.matchAll(/{{\s*([^},\s]+).*?}}/g)].map((match) => match[1]).sort();

await mkdir(localeDirectory, { recursive: true });
const existingLocales = new Set(await readdir(localeDirectory));
const requestedLocales = process.argv.find((argument) => argument.startsWith("--locales="))?.slice("--locales=".length).split(",");
for (const [locale, target] of Object.entries(languages)) {
  if (requestedLocales && !requestedLocales.includes(locale)) continue;
  if (process.argv.includes("--missing") && existingLocales.has(`${locale}.json`)) continue;
  const translatedChunks = [];
  for (let index = 0; index < chunks.length; index += 4) {
    translatedChunks.push(...await Promise.all(chunks.slice(index, index + 4).map((chunk) => translateChunk(target, chunk))));
  }
  const translation = requestedKeys
    ? JSON.parse(await readFile(join(localeDirectory, `${locale}.json`), "utf8"))
    : structuredClone(source);
  for (const entry of translatedChunks.flat()) {
    const original = entries.find((candidate) => candidate.path.join(".") === entry.path.join("."));
    if (JSON.stringify(placeholders(original.value)) !== JSON.stringify(placeholders(entry.value))) {
      throw new Error(`Placeholder mismatch in ${locale}:${entry.path.join(".")}: ${JSON.stringify(entry.value)}.`);
    }
    setAtPath(translation, entry.path, entry.value);
  }
  if (process.argv.includes("--prune")) pruneUnknownKeys(translation, source);
  // The free endpoint rate-limits bursts, so locales are spaced out.
  await wait(3_000);
  await writeFile(join(localeDirectory, `${locale}.json`), `${JSON.stringify(translation, null, 2)}\n`, "utf8");
  console.log(`Translated ${locale} (${entries.length} strings).`);
}
