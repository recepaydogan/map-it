/** Localize map source notes while retaining client item and NPC terminology. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const source = await read("public/data/locales/wow-forever/source.json");
const notes = await read("data/map-context-localization/quest-source-notes.json");
const indices = new Map(source.keys.map((key, index) => [key, index]));
const languages = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
for (const [id, note] of Object.entries(notes)) {
  if (english.map.questMarkers[id]?.startsAt !== note.en || !note.en.startsWith(source.values[indices.get(note.itemKey)])) {
    throw new Error(`Quest source note changed: ${id}`);
  }
  if (note.requiredItemKey && !note.en.includes(source.values[indices.get(note.requiredItemKey)])) {
    throw new Error(`Required item changed: ${id}`);
  }
  if (note.npcAnchorKey && !source.values[indices.get(note.npcAnchorKey)]?.includes("Commander Haalien")) {
    throw new Error(`NPC anchor changed: ${id}`);
  }
}
const check = process.argv.includes("--check");
for (const [language, gameLocale] of Object.entries(languages)) {
  const pack = await read(`public/data/locales/wow-forever/${gameLocale}.json`);
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const target = JSON.parse(raw);
  let added = 0;
  for (const [id, note] of Object.entries(notes)) {
    const translation = note[language];
    const item = pack.values[indices.get(note.itemKey)];
    const required = note.requiredItemKey && pack.values[indices.get(note.requiredItemKey)];
    if (!translation?.includes(item) || (required && !translation.includes(required)) ||
      (note.npcAnchorKey && !pack.values[indices.get(note.npcAnchorKey)])) {
      throw new Error(`${language}/${id}: client item or NPC anchor missing`);
    }
    const entry = target.map.questMarkers[id] ??= {};
    if (!entry.startsAt) { entry.startsAt = translation; added += 1; }
  }
  const output = JSON.stringify(target, null, 2) + "\n";
  if (check) {
    if (output !== raw) throw new Error(`${language}: quest source notes are stale`);
  } else if (output !== raw) await writeFile(path, output);
  console.log(`${language}: ${added} quest source notes added`);
}
