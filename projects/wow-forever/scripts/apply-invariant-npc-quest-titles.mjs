/** Write source-verified invariant NPC proper names used as quest titles. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const catalog = await read("data/quest-title-localization/invariant-npc-quest-titles.json");
if (catalog.source.revision !== "104f35678ca39ab1fb78b655f815cc7016f5e0c8") {
  throw new Error("Classic invariant quest title source revision changed");
}
const check = process.argv.includes("--check");
for (const language of ["de", "es", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const locale = JSON.parse(raw);
  let added = 0;
  for (const [id, marker] of Object.entries(english.map.questMarkers)) {
    if (catalog.names[marker.name]?.[language] !== marker.name) continue;
    const entry = locale.map.questMarkers[id] ??= {};
    if (entry.name && entry.name !== marker.name) {
      throw new Error(`${language}/${id}: conflicting NPC quest title`);
    }
    if (!entry.name) { entry.name = marker.name; added += 1; }
  }
  const output = JSON.stringify(locale, null, 2) + "\n";
  if (check) {
    if (output !== raw) throw new Error(`${language}: invariant NPC quest titles are stale`);
  } else if (output !== raw) await writeFile(path, output);
  console.log(`${language}: ${added} invariant NPC quest title fields`);
}
