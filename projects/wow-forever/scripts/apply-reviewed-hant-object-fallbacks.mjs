/** Reuse reviewed Simplified Chinese game-object names in Traditional Chinese. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const simplified = await read("src/i18n/locales/zh-Hans.json");
const source = (await read("data/object-name-localization/polestar-forever-objects.json")).names;
const reviewed = await read("data/object-name-localization/reviewed-hant-fallbacks.json");
const path = join(root, "src/i18n/locales/zh-Hant.json");
const raw = await readFile(path, "utf8");
const traditional = JSON.parse(raw);
let added = 0;
for (const [name, record] of Object.entries(reviewed)) {
  if (source[name]?.objectIds.length !== 1 || source[name].objectIds[0] !== record.objectId ||
    source[name]["zh-Hans"] !== record["zh-Hans"] || source[name]["zh-Hant"] ||
    !record["zh-Hant"]?.trim()) {
    throw new Error(`${name}: reviewed object source changed`);
  }
  let found = 0;
  for (const [id, marker] of Object.entries(english.map.questMarkers)) {
    for (const field of ["startsAt", "endsAt"]) {
      if (marker[field] !== name) continue;
      found += 1;
      if (simplified.map.questMarkers[id]?.[field] !== record["zh-Hans"]) {
        throw new Error(`${name}: Simplified Chinese object context changed`);
      }
      const target = traditional.map.questMarkers[id] ??= {};
      if (target[field] && target[field] !== record["zh-Hant"]) {
        throw new Error(`${name}: Traditional Chinese object conflicts at ${id}`);
      }
      if (!target[field]) { target[field] = record["zh-Hant"]; added += 1; }
    }
  }
  if (!found) throw new Error(`${name}: no matching object markers`);
}
const output = JSON.stringify(traditional, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (output !== raw) throw new Error("Traditional Chinese object fallbacks are stale");
} else if (output !== raw) await writeFile(path, output);
console.log(`${added} reviewed Traditional Chinese object fields added`);
