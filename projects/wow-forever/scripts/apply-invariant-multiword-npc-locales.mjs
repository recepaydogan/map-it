/** Record Classic-verified unchanged character names in each app locale. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const catalog = await read("data/npc-name-localization/invariant-multiword-names.json");
const questTitles = await read("data/quest-title-localization/polestar-forever-titles.json");
const reviewedTitleReuse = await read("data/quest-marker-localization/reviewed-quest-title-npc-reuse.json");
const languages = ["de", "es", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
if (catalog.source.revision !== "104f35678ca39ab1fb78b655f815cc7016f5e0c8") {
  throw new Error("Classic invariant NPC source revision changed");
}
const rows = [];
for (const [id, marker] of Object.entries(english.map.questMarkers)) {
  for (const field of ["startsAt", "endsAt"]) {
    if (marker[field]) rows.push({ name: marker[field], path: ["questMarkers", id, field] });
  }
}
for (const group of ["classTrainers", "professionTrainers", "mapgenieCommunity"]) {
  for (const [id, marker] of Object.entries(english.map[group])) {
    if (marker.name) rows.push({ name: marker.name, path: [group, id, "name"] });
  }
}
for (const [id, name] of Object.entries(english.map.repairVendors)) {
  rows.push({ name, path: ["repairVendors", id] });
}
for (const [id, name] of Object.entries(english.map.questNpcs.names)) {
  rows.push({ name, path: ["questNpcs", "names", id] });
}
const check = process.argv.includes("--check");
for (const language of languages) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const locale = JSON.parse(raw);
  let added = 0;
  for (const row of rows) {
    if (catalog.names[row.name]?.[language] !== row.name) continue;
    let node = locale.map;
    for (const key of row.path.slice(0, -1)) node = node[key] ??= {};
    const field = row.path.at(-1);
    if (node[field] && node[field] !== row.name) {
      const reviewedQuestTitle = reviewedTitleReuse[language]?.includes(row.name)
        ? new Set(Object.entries(english.map.questMarkers)
          .filter(([, marker]) => marker.name === row.name)
          .map(([id]) => locale.map.questMarkers[id]?.name).filter(Boolean))
        : new Set();
      const matchesReviewedTitle = reviewedQuestTitle.size === 1
        && reviewedQuestTitle.has(node[field]);
      if (questTitles.titles[row.name]?.[language] === node[field]
        || matchesReviewedTitle) continue;
      throw new Error(`${language}: conflicting NPC name at ${row.path.join(".")}`);
    }
    if (!node[field]) { node[field] = row.name; added += 1; }
  }
  const output = JSON.stringify(locale, null, 2) + "\n";
  if (check) {
    if (output !== raw) throw new Error(`${language}: multiword NPC names are stale`);
  } else if (output !== raw) await writeFile(path, output);
  console.log(`${language}: ${added} verified unchanged character-name fields`);
}
