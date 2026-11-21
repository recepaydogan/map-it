/** Fill quest start/end objects only when the ID-matched Forever name is unique. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const catalog = await read("data/object-name-localization/polestar-forever-objects.json");
const reference = await read("data/npc-name-localization/polestar-forever-names.json");
if (catalog.source.englishIds.revision !== reference.source.englishIds.revision ||
  catalog.source.localizedNames.revision !== reference.source.localizedNames.revision) {
  throw new Error("Forever object catalog source revision changed");
}
const known = new Set(Object.values(english.map.questMarkers)
  .flatMap((marker) => [marker.startsAt, marker.endsAt]).filter(Boolean));
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
for (const [name, entry] of Object.entries(catalog.names)) {
  if (!known.has(name) || !entry.objectIds?.length ||
    languages.some((language) => entry[language] &&
      (!entry[language].trim() || entry[language] === name))) {
    throw new Error(`Invalid Forever object name: ${name}`);
  }
}
const check = process.argv.includes("--check");
for (const language of languages) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const target = JSON.parse(raw);
  let added = 0;
  for (const [id, marker] of Object.entries(english.map.questMarkers)) {
    for (const field of ["startsAt", "endsAt"]) {
      const translation = catalog.names[marker[field]]?.[language];
      if (!translation) continue;
      const entry = target.map.questMarkers[id] ??= {};
      if (!entry[field]) { entry[field] = translation; added += 1; }
    }
  }
  const output = JSON.stringify(target, null, 2) + "\n";
  if (check) {
    if (output !== raw) throw new Error(`${language}: Forever object names are stale`);
  } else if (output !== raw) await writeFile(path, output);
  console.log(`${language}: ${added} quest object fields added`);
}
