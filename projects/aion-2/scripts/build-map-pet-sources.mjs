import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../public/", import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), "utf8"));

export function buildMapPetSources(index, petEntries, search, sourceShards) {
  const summaries = new Map(index.entries.filter(entry => entry.category === "mounts")
    .map(entry => [entry.id, entry]));
  const searchItems = new Map(search.items.map(item => [item.id, item]));
  const pets = {};
  const sources = {};

  for (const [petId, entry] of Object.entries(petEntries)) {
    const summary = summaries.get(petId);
    if (!summary?.name || !summary.icon) continue;
    const itemIds = new Set(entry.sections
      .filter(section => section.title === "reference.labels.unlock-items")
      .flatMap(section => section.links ?? [])
      .filter(link => link.category === "items")
      .map(link => link.id));

    for (const itemId of itemIds) {
      const item = searchItems.get(itemId);
      if (!item) continue;
      for (const source of sourceShards[item.chunk]?.[itemId] ?? []) {
        if (source.kind === "related") continue;
        const location = search.locations[source.location];
        if (!location?.mapId || !location.point?.id) continue;
        // A container at an event object is the reward; its possible pets are not direct map sources.
        if (source.kind === "container" && location.point.category === "event-object") continue;
        const map = sources[location.mapId] ??= { references: {}, markers: {} };
        const referenceId = location.point.reference?.id;
        const bucket = referenceId ? map.references : map.markers;
        const key = referenceId ?? location.point.id;
        const petIds = bucket[key] ??= [];
        if (!petIds.includes(petId)) petIds.push(petId);
        pets[petId] = { id: petId, name: summary.name, icon: summary.icon, category: summary.category };
      }
    }
  }

  return { version: 1, pets, sources };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const petEntries = {};
  for (const file of readdirSync(new URL("data/reference/mounts/", root)).filter(file => file.endsWith(".json"))) {
    Object.assign(petEntries, read(`data/reference/mounts/${file}`).entries);
  }
  const search = read("data/map-search/index.json");
  const sourceShards = {};
  for (const chunk of new Set(search.items.map(item => item.chunk))) {
    sourceShards[chunk] = read(`data/map-search/${chunk}.json`).sources;
  }
  const catalog = buildMapPetSources(read("data/reference/index.json"), petEntries, search, sourceShards);
  for (const pet of Object.values(catalog.pets)) {
    if (!existsSync(new URL(pet.icon, root))) throw new Error(`Missing pet portrait: ${pet.id}`);
  }
  writeFileSync(new URL("data/reference/map-pet-sources.json", root), JSON.stringify(catalog) + "\n");
  console.log(`Built map acquisition sources for ${Object.keys(catalog.pets).length} pets.`);
}
