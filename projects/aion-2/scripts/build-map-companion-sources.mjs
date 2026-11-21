import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Publish a small source lookup so the map does not need the full reference index. */
export function buildMapCompanionSources(index, companions) {
  const byId = new Map(index.entries.map(entry => [entry.id, entry]));
  const sources = {};
  for (const [id, record] of Object.entries(companions.entries)) {
    if (!record.available || !record.sources.length) continue;
    const summary = byId.get(id);
    if (!summary?.icon || !summary.name) throw new Error(`Missing companion portrait or name: ${id}`);
    const companion = { id, category: summary.category, name: summary.name, icon: summary.icon };
    for (const source of record.sources) {
      const entries = sources[source.npc.id] ??= [];
      if (!entries.some(entry => entry.companion.id === id)) entries.push({ companion, soul: record.soul, required: record.required });
    }
  }
  return { version: 1, sources };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = new URL("../public/", import.meta.url);
  const read = path => JSON.parse(readFileSync(new URL(path, root), "utf8"));
  const catalog = buildMapCompanionSources(read("data/reference/index.json"), read("data/reference/intelligence/companions.json"));
  for (const entries of Object.values(catalog.sources)) for (const entry of entries) {
    if (!existsSync(new URL(entry.companion.icon, root))) throw new Error(`Missing portrait: ${entry.companion.icon}`);
  }
  const output = new URL("data/reference/map-companion-sources.json", root);
  const content = JSON.stringify(catalog) + "\n";
  if (!existsSync(output) || readFileSync(output, "utf8") !== content) {
    writeFileSync(output, content);
  }
  console.log(`Built companion rewards for ${Object.keys(catalog.sources).length} source entities.`);
}
