/** Reuse manually reviewed game labels across matching app fields in the same locale. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const rows = await read("data/quest-marker-localization/reviewed-cross-field-reuse.json");
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const valueAt = (object, path) => path.split(".").reduce((node, key) => node?.[key], object);

if (!Array.isArray(rows)) throw new Error("Reviewed cross-field rows must be an array");
const seen = new Set();
for (const row of rows) {
  if (!languages.includes(row.language) ||
    Object.keys(row).sort().join(",") !== "language,source,target" ||
    !(/^(map\.(questMarkers\.[^.]+\.(name|startsAt|endsAt)|publishedSettlements\.[^.]+|publishedPlaces\.[^.]+\.region|publishedInstances\.[^.]+\.region)|updates\.releases\.[^.]+\.items\.\d+\.parts\.\d+\.text)$/.test(row.target)) ||
    typeof row.source !== "string" || seen.has(`${row.language}/${row.target}`) ||
    typeof valueAt(english, row.source) !== "string" ||
    valueAt(english, row.target) !== valueAt(english, row.source)) {
    throw new Error(`Invalid reviewed cross-field reuse: ${JSON.stringify(row)}`);
  }
  seen.add(`${row.language}/${row.target}`);
}

const pendingWrites = [];
for (const language of languages) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const locale = JSON.parse(raw);
  let added = 0;
  for (const row of rows.filter((candidate) => candidate.language === language)) {
    const source = valueAt(locale, row.source);
    if (typeof source !== "string" || !source.trim()) {
      throw new Error(`${language}/${row.source}: reviewed translation missing`);
    }
    const target = valueAt(locale, row.target);
    if (target && target !== source && target !== valueAt(english, row.target)) {
      throw new Error(`${language}/${row.target}: conflicting translation`);
    }
    if (target !== source) {
      const parts = row.target.split(".");
      let node = locale;
      for (const part of parts.slice(0, -1)) node = node[part] ??= {};
      node[parts.at(-1)] = source;
      added += 1;
    }
  }
  const output = JSON.stringify(locale, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (output !== raw) throw new Error(`${language}: reviewed cross-field map labels are stale`);
  } else if (output !== raw) pendingWrites.push([path, output]);
  console.log(`${language}: ${added} reviewed identical-text map fields`);
}
for (const [path, output] of pendingWrites) await writeFile(path, output);
