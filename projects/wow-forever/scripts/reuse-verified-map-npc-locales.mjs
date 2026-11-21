/** Reuse an NPC name only when existing map fields agree within the language. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const english = JSON.parse(await readFile(join(root, "src/i18n/locales/en.json"), "utf8"));
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const rows = [];
for (const [id, marker] of Object.entries(english.map.questMarkers)) {
  for (const field of ["startsAt", "endsAt"]) {
    if (marker[field]) rows.push({ path: ["questMarkers", id, field], name: marker[field] });
  }
}
for (const group of ["classTrainers", "professionTrainers", "mapgenieCommunity"]) {
  for (const [id, marker] of Object.entries(english.map[group])) {
    if (marker.name) rows.push({ path: [group, id, "name"], name: marker.name });
  }
}
for (const [id, name] of Object.entries(english.map.repairVendors)) {
  rows.push({ path: ["repairVendors", id], name });
}
for (const [id, name] of Object.entries(english.map.questNpcs.names)) {
  rows.push({ path: ["questNpcs", "names", id], name });
}
const check = process.argv.includes("--check");
for (const language of languages) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const locale = JSON.parse(raw);
  const valuesByName = new Map();
  for (const row of rows) {
    const translated = row.path.reduce((node, key) => node?.[key], locale.map);
    if (!translated) continue;
    const values = valuesByName.get(row.name) ?? new Set();
    values.add(translated);
    valuesByName.set(row.name, values);
  }
  let added = 0;
  for (const row of rows) {
    const values = valuesByName.get(row.name);
    if (values?.size !== 1) continue;
    let node = locale.map;
    for (const key of row.path.slice(0, -1)) node = node[key] ??= {};
    const field = row.path.at(-1);
    if (!node[field]) { node[field] = [...values][0]; added += 1; }
  }
  const output = JSON.stringify(locale, null, 2) + "\n";
  if (check) {
    if (output !== raw) throw new Error(`${language}: map NPC name reuse is stale`);
  } else if (output !== raw) await writeFile(path, output);
  console.log(`${language}: ${added} matching map NPC names reused`);
}
