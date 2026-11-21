/** Apply reviewed NPC names already localized as exact-match Forever quest titles. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const reviewed = await read("data/quest-marker-localization/reviewed-quest-title-npc-reuse.json");
const languages = ["de", "fr"];
if (Object.keys(reviewed).sort().join(",") !== languages.join(",")) {
  throw new Error("Unexpected language set in reviewed NPC name reuse");
}

for (const language of languages) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const locale = JSON.parse(raw);
  const names = reviewed[language];
  if (!Array.isArray(names) || new Set(names).size !== names.length) {
    throw new Error(`${language}: invalid reviewed NPC name list`);
  }
  let added = 0;
  for (const name of names) {
    const values = new Set(Object.entries(english.map.questMarkers)
      .filter(([, marker]) => marker.name === name)
      .map(([id]) => locale.map.questMarkers[id]?.name).filter((value) => value && value !== name));
    if (values.size !== 1) throw new Error(`${language}/${name}: quest title is missing or ambiguous`);
    const translated = [...values][0];
    const fields = [];
    for (const [id, marker] of Object.entries(english.map.questMarkers)) {
      for (const field of ["startsAt", "endsAt"]) {
        if (marker[field] === name) fields.push(["questMarkers", id, field]);
      }
    }
    for (const [id, value] of Object.entries(english.map.questNpcs.names)) {
      if (value === name) fields.push(["questNpcs", "names", id]);
    }
    for (const [id, trainer] of Object.entries(english.map.classTrainers)) {
      if (trainer.name === name) fields.push(["classTrainers", id, "name"]);
    }
    if (!fields.length) throw new Error(`${language}/${name}: no NPC name fields found`);
    for (const parts of fields) {
      let source = english.map;
      let target = locale.map;
      for (const part of parts.slice(0, -1)) {
        source = source[part];
        target = target[part] ??= {};
      }
      const key = parts.at(-1);
      if (source[key] !== name) throw new Error(`${language}/${name}: English NPC name changed`);
      if (target[key] && target[key] !== name && target[key] !== translated) {
        throw new Error(`${language}/${name}: conflicting localized NPC name`);
      }
      if (target[key] !== translated) {
        target[key] = translated;
        added += 1;
      }
    }
  }
  const output = JSON.stringify(locale, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (output !== raw) throw new Error(`${language}: reviewed NPC name reuse is stale`);
  } else if (output !== raw) await writeFile(path, output);
  console.log(`${language}: ${names.length} reviewed NPC names; ${added} locale fields filled`);
}
