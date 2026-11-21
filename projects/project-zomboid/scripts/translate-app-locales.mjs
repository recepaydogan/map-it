import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDirectory, "..");
const localeDirectory = join(projectRoot, "src", "i18n", "locales");
const source = JSON.parse(await readFile(join(localeDirectory, "en.json"), "utf8"));

const languages = {
  ca: "ca",
  cs: "cs",
  da: "da",
  de: "de",
  "es-AR": "es-AR",
  "es-CL": "es-CL",
  "es-MX": "es-MX",
  es: "es",
  fi: "fi",
  fr: "fr",
  hu: "hu",
  id: "id",
  it: "it",
  ja: "ja",
  ko: "ko",
  nl: "nl",
  no: "no",
  pl: "pl",
  "pt-BR": "pt-BR",
  pt: "pt-PT",
  ro: "ro",
  ru: "ru",
  th: "th",
  tr: "tr",
  uk: "uk",
  "zh-Hans": "zh-CN",
  "zh-Hant": "zh-TW",
};

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

const requestedChunkSize = Number(
  process.argv.find((argument) => argument.startsWith("--chunk-size="))?.slice("--chunk-size=".length),
);
const chunkSize = Number.isInteger(requestedChunkSize) && requestedChunkSize > 0
  ? requestedChunkSize
  : 45;
const chunks = [];
for (let index = 0; index < entries.length; index += chunkSize) {
  chunks.push(entries.slice(index, index + chunkSize));
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const protectedTerms = /{{.*?}}|Project Zomboid Map Bridge|Project Zomboid Map|PZ Map|Project Zomboid|The Indie Stone|Knox Country|Build 42|Bridge|Overwolf|Workshop|Discord/g;
const contextualSourceByKey = {
  "map.library.seeAvailable": "See available game mods",
  "map.filters.onlyLayer": "Show only the {{layer}} map layer",
  "map.filters.runs": "Loot routes",
  "map.filters.craft": "Crafting",
  "map.lootRun.title": "Loot route",
  "map.lootRun.activeRun": "Active loot route",
  "map.lootRun.progress": "Loot route progress",
  "map.lootRun.clearRun": "Delete this loot route",
  "map.lootRun.distance": "{{count}} map grid squares",
  "map.markerGroups.loot": "Loot routes",
  "map.crafting.title": "Item crafting planner",
  "map.crafting.inputCount": "{{count}} required ingredients or tools",
  "map.crafting.keptTool": "Tool — not consumed",
  "map.crafting.craft": "Make this item",
  "map.crafting.craftable": "Recipe available",
  "map.view.open": "Map view and building levels",
  "map.view.floor": "Building level",
  "map.vehicleSpawns.hoverHint": "Move the pointer across a highlighted vehicle area",
  "map.spawnPoints.hoverHint": "Move the pointer over a player spawn point to see its professions",
  "map.spawnPoints.summary": "{{count}} player spawn points across {{towns}} towns",
  "map.spawnPoints.professionPointCount": "This profession has {{count}} player spawn points across the county",
  "map.worldLayers.foragingHint": "Game-defined foraging terrain and density",
  "map.worldLayers.spawnPointsHint": "Player starting homes grouped by profession",
  "map.route.stops": "{{count}} route stop",
  "map.route.stops_other": "{{count}} route stops",
  "map.route.stop": "Route stop {{number}}",
  "map.route.tiles": "{{count}} map grid squares total",
  "map.details.floors": "Building levels",
  "settings.distanceTiles": "Game map grid squares",
  "settings.selectionZoomDesc": "Zoom in when you select a map marker or center the map on your player character. When disabled, keep the current zoom and only pan the map.",
  "settings.replayTour": "Guided app tour",
  "settings.startTour": "Start guided tour",
  "onboarding.btn_start": "Start guided tour",
  "onboarding.btn_skip": "Skip guided tour",
  "onboarding.btn_done": "Finish",
  "onboarding.aria_dialog": "Guided product tour",
  "onboarding.aria_close": "Exit tutorial",
  "onboarding.step_tabs_body": "Save places, plan routes for looting, and find crafting ingredients.",
  "onboarding.step_finish_body": "Open Settings anytime to change options or replay this guided tour.",
  "overlay.autoOpenHint": "Open or close this map with {{hotkey}}",
  "overlay.bridge.restartRequiredBody": "Close Project Zomboid completely, then open it again to enable live location tracking.",
  "overlay.minimap.toggleHint": "Open or close this in-game minimap with {{hotkey}}",
  "overlay.minimap.close": "Close the in-game minimap",
};

const translateChunk = async (target, chunk, attempt = 1) => {
  const query = chunk
    .map(({ value }, index) => {
      let fragmentIndex = 0;
      const contextualValue = contextualSourceByKey[chunk[index].path.join(".")] ?? value;
      const protectedValue = contextualValue.replace(protectedTerms, () => `<x id="${String.fromCharCode(65 + fragmentIndex++)}"/>`);
      return `__PZIM_${String(index).padStart(4, "0")}__\n${protectedValue}`;
    })
    .join("\n");
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  for (const [key, value] of Object.entries({ client: "gtx", sl: "en", tl: target, dt: "t", q: query })) {
    url.searchParams.set(key, value);
  }

  try {
    const forceFallbackEndpoint = process.argv.includes("--fallback-endpoint");
    let response = forceFallbackEndpoint
      ? { status: 429 }
      : await fetch(url, { headers: { "User-Agent": "PZIM locale generator" } });
    // The public single endpoint occasionally rate-limits the whole client IP.
    // Chrome's dictionary endpoint uses the same engine and response text, so
    // keep translation generation usable without falling back to English.
    if (response.status === 429) {
      const fallbackUrl = new URL("https://clients5.google.com/translate_a/t");
      for (const [key, value] of Object.entries({ client: "dict-chrome-ex", sl: "en", tl: target, q: query })) {
        fallbackUrl.searchParams.set(key, value);
      }
      response = await fetch(fallbackUrl, { headers: { "User-Agent": "PZIM locale generator" } });
    }
    if (!response.ok) throw new Error(`Translation request failed with ${response.status}.`);
    const payload = await response.json();
    const translated = typeof payload[0] === "string"
      ? payload[0]
      : payload[0].map((segment) => segment[0]).join("");
    const results = new Map();
    const marker = /__PZIM_(\d{4})__\s*([\s\S]*?)(?=__PZIM_\d{4}__|$)/g;
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
    if (attempt >= 4) throw error;
    await wait(500 * 2 ** attempt);
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
  await writeFile(join(localeDirectory, `${locale}.json`), `${JSON.stringify(translation, null, 2)}\n`, "utf8");
  console.log(`Translated ${locale} (${entries.length} strings).`);
}
