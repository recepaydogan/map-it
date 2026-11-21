/** Apply reviewed Portuguese labels for quest objects absent from the client pack. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const source = await read("public/data/locales/wow-forever/source.json");
const authored = await read("data/object-name-localization/authored-pt-map-objects.json");
const path = join(root, "src/i18n/locales/pt-BR.json");
const raw = await readFile(path, "utf8");
const target = JSON.parse(raw);
let added = 0;
for (const [id, record] of Object.entries(authored)) {
  if (!Array.isArray(record.fields) || !record.fields.length ||
    !record.context || !record.en || !record["pt-BR"] ||
    record.en === record["pt-BR"] ||
    source.values.includes(record.en)) {
    throw new Error(`${id}: invalid authored Portuguese object fallback`);
  }
  for (const field of record.fields) {
    if (!["startsAt", "endsAt"].includes(field) ||
      english.map.questMarkers[id]?.[field] !== record.en) {
      throw new Error(`${id}/${field}: source object mismatch`);
    }
    const current = target.map.questMarkers[id]?.[field];
    if (current && current !== record["pt-BR"]) {
      throw new Error(`${id}/${field}: existing Portuguese object conflicts`);
    }
    target.map.questMarkers[id] ??= {};
    if (!current) {
      target.map.questMarkers[id][field] = record["pt-BR"];
      added += 1;
    }
  }
}
const output = JSON.stringify(target, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (output !== raw) throw new Error("Portuguese map object fallbacks are stale");
} else if (output !== raw) await writeFile(path, output);
console.log(`${added} Portuguese quest object fields added`);
