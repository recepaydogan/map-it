/** Fill missing Forever NPC labels with explicitly authored locale fallbacks. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const catalog = await read("data/npc-name-localization/authored-western-map-fallbacks.json");
const polestar = (await read("data/npc-name-localization/polestar-forever-names.json")).names;
const mapSeeded = (await read("data/npc-name-localization/map-seeded-forever-names.json")).names;
const reviewed = await read("data/quest-marker-localization/reviewed-partial-entity-names.json");
const languages = ["de", "es", "es-MX", "fr", "pt-BR"];
const gameLocales = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
  "pt-BR": "ptBR" };
const entitySource = await read("public/data/locales/wow-forever/map-entity-source.json");
const entityIndices = new Map(entitySource.keys.map((key, index) => [key, index]));
const entityPacks = Object.fromEntries(await Promise.all(languages.map(async (language) =>
  [language, await read(`public/data/locales/wow-forever/map-entity-${gameLocales[language]}.json`)])));
const pathsByName = new Map();
const add = (name, parts) => {
  if (typeof name !== "string" || !name) return;
  const paths = pathsByName.get(name) ?? [];
  paths.push(parts);
  pathsByName.set(name, paths);
};

for (const [id, record] of Object.entries(english.map.questMarkers)) {
  for (const field of ["startsAt", "endsAt"]) {
    add(record[field], ["questMarkers", id, field]);
  }
}
for (const group of ["classTrainers", "professionTrainers", "mapgenieCommunity"]) {
  for (const [id, record] of Object.entries(english.map[group])) {
    for (const field of group === "mapgenieCommunity" ? ["name", "detail"] : ["name"]) {
      add(record[field], [group, id, field]);
    }
  }
}
for (const [id, name] of Object.entries(english.map.repairVendors)) {
  add(name, ["repairVendors", id]);
}
for (const [id, name] of Object.entries(english.map.questNpcs.names)) {
  add(name, ["questNpcs", "names", id]);
}

if (catalog.source !== "authored-fallback-for-missing-forever-npc-locales") {
  throw new Error("Unexpected authored fallback catalog source");
}
for (const [name, entry] of Object.entries(catalog.names)) {
  const sourceNpc = polestar[name] ?? reviewed[name];
  if (!sourceNpc?.npcIds?.length || !pathsByName.has(name) ||
    Object.keys(entry).some((key) => key !== "invariantLanguages" && !languages.includes(key)) ||
    !languages.some((language) => entry[language]) ||
    (entry.invariantLanguages && (!Array.isArray(entry.invariantLanguages) ||
      entry.invariantLanguages.some((language) => !languages.includes(language))))) {
    throw new Error(`${name}: invalid authored NPC fallback`);
  }
  for (const language of languages) {
    if (entry[language] === undefined) continue;
    if (typeof entry[language] !== "string" || !entry[language].trim() ||
      (entry[language] === name) !== (entry.invariantLanguages?.includes(language) ?? false)) {
      throw new Error(`${name}: invalid ${language} authored NPC name`);
    }
    if (polestar[name]?.[language] || mapSeeded[name]?.[language] ||
      sourceNpc.npcIds.some((id) => {
        const index = entityIndices.get(`Creature:${id}:0`);
        return index !== undefined && entityPacks[language].values[index];
      })) {
      throw new Error(`${name}: ${language} now has a sourced NPC name`);
    }
  }
}

for (const language of languages) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const locale = JSON.parse(raw);
  let changed = 0;
  for (const [name, entry] of Object.entries(catalog.names)) {
    const translated = entry[language];
    if (!translated) continue;
    for (const parts of pathsByName.get(name)) {
      let node = locale.map;
      for (const part of parts.slice(0, -1)) node = node[part] ??= {};
      const key = parts.at(-1);
      if (node[key] && node[key] !== translated) {
        throw new Error(`${language}/${parts.join("/")}: conflicts with sourced NPC name`);
      }
      if (node[key] !== translated) {
        node[key] = translated;
        changed += 1;
      }
    }
  }
  const output = JSON.stringify(locale, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (output !== raw) throw new Error(`${language}: authored NPC fallbacks are stale`);
  } else if (output !== raw) await writeFile(path, output);
  console.log(`${language}: ${changed} authored NPC fallback fields`);
}
