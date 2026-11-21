import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GAME_APP_LOCALE_TERMS, GAME_GUIDE_LANGUAGE_SOURCE } from "../src/game-config.ts";
import englishGame from "../src/features/knowledge/guide-names.json" with { type: "json" };
import englishApp from "../src/i18n/locales/en.json" with { type: "json" };

const flatten = (value, prefix = "", result = {}) => {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") result[path] = child;
    else flatten(child, path, result);
  }
  return result;
};
const getAtPath = (value, path) => path.split(".").reduce((current, key) => current?.[key], value);
const setAtPath = (value, path, replacement) => {
  const segments = path.split(".");
  const parent = segments.slice(0, -1).reduce((current, key) => current[key], value);
  parent[segments.at(-1)] = replacement;
};

const englishEntries = flatten(englishApp);
const mappings = { ...GAME_APP_LOCALE_TERMS };
const skipped = [];
for (const [appKey, label] of Object.entries(englishEntries)) {
  const prefix = appKey.startsWith("biomeMap.biomes.") || appKey.startsWith("worlds.biomes.")
    ? "biome.minecraft." : appKey.startsWith("worlds.blocks.") ? "block.minecraft." : null;
  if (!prefix) continue;
  const slug = appKey.split(".").at(-1).replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  const gameKey = `${prefix}${slug}`;
  if (!englishGame[gameKey] || englishGame[gameKey].toLowerCase() !== label.toLowerCase()) {
    skipped.push(appKey);
    continue;
  }
  mappings[appKey] = gameKey;
}
for (const [appKey, gameKey] of Object.entries(mappings)) {
  if (englishEntries[appKey]?.toLowerCase() !== englishGame[gameKey]?.toLowerCase())
    throw new Error(`English text mismatch for ${appKey} → ${gameKey}`);
}
console.log(`${Object.keys(mappings).length} exact game terms mapped; ${skipped.length} custom or renamed labels skipped`);

for (const locale of Object.keys(GAME_GUIDE_LANGUAGE_SOURCE.localeCodes).filter(code => code !== "en")) {
  const path = resolve("src", "i18n", "locales", `${locale}.json`);
  let original;
  try { original = await readFile(path, "utf8"); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    original = null;
  }
  const app = original ? JSON.parse(original) : structuredClone(englishApp);
  const game = JSON.parse(await readFile(resolve("public", "knowledge-data", "java",
    GAME_GUIDE_LANGUAGE_SOURCE.version, "languages", `${locale}.json`), "utf8"));
  if (process.argv.includes("--audit")) {
    const different = Object.entries(mappings).filter(([appKey, gameKey]) =>
      game[gameKey] && getAtPath(app, appKey) !== game[gameKey]);
    console.log(`${locale}: ${different.length} app terms differ from the game source`);
    for (const [appKey, gameKey] of different)
      console.log(`  ${appKey}: ${JSON.stringify(getAtPath(app, appKey))} → ${JSON.stringify(game[gameKey])}`);
    continue;
  }
  let changed = 0;
  for (const [appKey, gameKey] of Object.entries(mappings)) {
    const translated = game[gameKey];
    if (!translated || getAtPath(app, appKey) !== englishEntries[appKey]) continue;
    setAtPath(app, appKey, translated);
    changed++;
  }
  if (process.argv.includes("--dry-run")) {
    console.log(`${locale}: ${changed} official game terms could be applied`);
    continue;
  }
  if (changed || !original) {
    const newline = original?.includes("\r\n") ? "\r\n" : "\n";
    await writeFile(path, `${JSON.stringify(app, null, 2).replaceAll("\n", newline)}${newline}`);
  }
  console.log(`${locale}: ${changed} official game terms applied`);
}
