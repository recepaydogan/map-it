/** Add profession trainer map pins that are missing from the profession details catalog. */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const markers = (await readJson("public/maps/world-atlas/locations-profession-trainers.json")).locations;
const labels = (await readJson("src/i18n/locales/en.json")).map.professionTrainers;
const detailDirectory = join(root, "public/data/professions/details");
const knownNames = new Set();
for (const file of await readdir(detailDirectory)) {
  if (!file.endsWith(".json")) continue;
  const details = JSON.parse(await readFile(join(detailDirectory, file), "utf8"));
  for (const trainer of details.trainers) knownNames.add(trainer.n.toLocaleLowerCase());
}

const professionForRole = (role) => {
  const value = role.toLocaleLowerCase();
  if (/mining trainer|\bminer\b/.test(value)) return "mining";
  if (/herbalism trainer|\bherbalist\b/.test(value)) return "herbalism";
  if (/skinning trainer|\bskinner\b/.test(value)) return "skinning";
  if (/\bmedic\b/.test(value)) return "firstaid";
  if (/\benchanter\b/.test(value)) return "enchanting";
  if (/\balchemist\b/.test(value)) return "alchemy";
  if (/\bcook\b/.test(value)) return "cooking";
  if (/\btailor\b/.test(value)) return "tailoring";
  if (/\bblacksmith\b/.test(value)) return "blacksmithing";
  if (/\bleatherworker\b/.test(value)) return "leatherworking";
  if (/\bfisher\b/.test(value)) return "fishing";
  return null;
};

const trainers = [];
const excluded = [];
for (const marker of markers) {
  const id = marker.id.split("-").at(-1);
  const label = labels[id];
  if (!label?.name || !(label.title || label.role)) throw new Error(`Missing trainer label for ${marker.id}`);
  if (knownNames.has(label.name.toLocaleLowerCase())) continue;
  const [, legacyRole, legacySide] = /^(.*?)(?: · (Alliance|Horde))?$/.exec(label.role || "");
  const role = label.title || legacyRole;
  const side = marker.trainerFaction || legacySide;
  const profession = professionForRole(role);
  if (!profession) {
    excluded.push({ name: label.name, role });
    continue;
  }
  trainers.push({ profession, markerId: marker.id, n: label.name, sub: role,
    ...(side ? { side } : {}),
    ...(marker.regionKey === "map.zephrasIsle" ? { zone: "Zephras Isle" } : {}) });
}

if (trainers.length !== 27 || excluded.length !== 3
  || excluded.some(({ role }) => !["Weapon Master", "Wolf Riding Instructor"].includes(role))) {
  throw new Error(`Review map-only trainer classification: ${trainers.length} professions, ${JSON.stringify(excluded)}`);
}
trainers.sort((a, b) => a.profession.localeCompare(b.profession) || a.n.localeCompare(b.n));
await writeFile(join(root, "public/data/professions/map-trainers.json"),
  `${JSON.stringify({ version: 1, source: "MapGenie profession trainer markers", trainers }, null, 2)}\n`);
console.log(`Published ${trainers.length} map-only profession trainers; excluded ${excluded.length} unrelated markers.`);
