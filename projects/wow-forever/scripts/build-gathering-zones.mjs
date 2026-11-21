/** Zone-level gathering planning data; Classic counts are never rendered as exact Forever spawn pins. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const sourceUrl = "https://foreverdb.net/guide/professions";
const fishingUrl = "https://foreverdb.net/profession/fishing";
const skinningUrl = "https://foreverdb.net/profession/skinning";
const fetchPage = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
};
const [html, fishingHtml, skinningHtml] = await Promise.all([
  fetchPage(sourceUrl), fetchPage(fishingUrl), fetchPage(skinningUrl),
]);
const section = html.split("Where herbs and ore grow (Classic data)")[1]?.split("</table>")[0];
if (!section) throw new Error("Gathering table is missing");
const decode = (value) => value.replace(/<[^>]+>/g, "")
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => String.fromCodePoint(code[0].toLowerCase() === "x"
    ? Number.parseInt(code.slice(1), 16) : Number(code)))
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
const fishingSection = fishingHtml.split("Where to fish</h2>")[1]?.split("</ul>")[0] ?? "";
const skinningSection = skinningHtml.split("Best zones for each skill range</h3>")[1]?.split("</ul>")[0] ?? "";
if (!fishingSection || !skinningSection) throw new Error("Fishing or skinning zone data is missing");
const fishingByZone = new Map([...fishingSection.matchAll(/<li>(.*?)<\/li>/g)].map((match) => {
  const [name, details] = decode(match[1]).split(/:\s*/, 2);
  const safeSkill = Number(details?.match(/nothing gets away from skill (\d+)/)?.[1]);
  const pool = details?.match(/; ([^;]*(?:School|Pool|Patch)[^;]*);/)?.[1];
  return [name, Number.isFinite(safeSkill) ? { safeSkill, ...(pool ? { pool } : {}) } : null];
}));
const skinningByZone = new Map();
for (const match of skinningSection.matchAll(/<li>Skill (\d+)-(\d+): (.*?)<\/li>/g)) {
  for (const name of decode(match[3]).split(", ")) {
    skinningByZone.set(name, [...(skinningByZone.get(name) ?? []), { from: Number(match[1]), to: Number(match[2]) }]);
  }
}
const parseResources = (value) => decode(value) === "none listed" ? [] : decode(value).split(", ").map((entry) => {
  const match = entry.match(/^(.+) (\d+)$/);
  if (!match) throw new Error(`Unexpected resource count: ${entry}`);
  return { name: match[1], count: Number(match[2]) };
});

const atlas = JSON.parse(await readFile("public/maps/world-atlas/metadata.json", "utf8"));
const tables = JSON.parse(await readFile("data/client-research/db2-table-names.json", "utf8"));
const assignment = tables.identified.find(({ name }) => name === "UiMapAssignment");
if (!assignment || atlas.source?.uiMapAssignmentFileDataId !== assignment.fileDataId) {
  throw new Error("Atlas UiMapAssignment metadata is missing or mismatched");
}
const floats = (value, count) => {
  const bytes = Buffer.alloc(count * 4);
  for (let index = 0; index < count; index += 1) {
    bytes.writeUInt32LE(Number((value >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
  }
  return Array.from({ length: count }, (_, index) => bytes.readFloatLE(index * 4));
};
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const byUiMap = new Map();
try {
  const file = `FILE${assignment.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
  const { reader } = readLocalWdc5(storage.readFile(file));
  if (reader.layoutHash.toString(16).padStart(8, "0") !== assignment.layoutHash) {
    throw new Error("UiMapAssignment layout changed");
  }
  for (const id of reader.getAllIDs()) {
    const uiMapId = reader.getRowRelationship(id);
    const row = reader.getRowData(id);
    if (!Number.isInteger(uiMapId) || row?.[4]?.data !== uiMapId) continue;
    const entries = byUiMap.get(uiMapId) ?? [];
    entries.push({ mapId: row[6].data, worldRegion: floats(row[2].data, 6) });
    byUiMap.set(uiMapId, entries);
  }
} finally {
  storage.close();
}
const project = createClientWorldProjector(atlas);
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const zones = [];
for (const row of section.matchAll(/<tr><td><a href="\/maps\/(\d+)"[^>]*>(.*?)<\/a><\/td><td>(.*?)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/g)) {
  const uiMapId = Number(row[1]);
  const name = decode(row[2]);
  const entries = byUiMap.get(uiMapId) ?? [];
  if (entries.length !== 1 || ![0, 1].includes(entries[0].mapId)) throw new Error(`No unique atlas projection for ${name}`);
  const { mapId, worldRegion } = entries[0];
  const midpoint = project(mapId, [
    (worldRegion[0] + worldRegion[3]) / 2,
    (worldRegion[1] + worldRegion[4]) / 2,
  ]);
  if (!midpoint || midpoint.x < atlas.bounds.minX || midpoint.x > atlas.bounds.maxX
    || midpoint.y < atlas.bounds.minY || midpoint.y > atlas.bounds.maxY) {
    throw new Error(`Projected zone center is outside the atlas: ${name}`);
  }
  zones.push({ id: slug(name), name, uiMapId, questLevels: decode(row[3]),
    x: Number(midpoint.x.toFixed(3)), y: Number(midpoint.y.toFixed(3)),
    herbs: parseResources(row[4]), ore: parseResources(row[5]),
    fishing: fishingByZone.get(name) ?? null,
    skinning: skinningByZone.get(name) ?? [] });
}
if (zones.length !== 16) throw new Error(`Expected 16 gathering zones, received ${zones.length}`);
if (zones.filter(({ fishing }) => fishing).length < 14 || zones.filter(({ skinning }) => skinning.length).length < 5) {
  throw new Error("Fishing or skinning guide coverage dropped");
}
const output = { version: 2, sourceUrl, fishingUrl, skinningUrl,
  basis: "Classic zone planning data shown by ForeverDB; zone centers projected from the installed Forever client", zones };
await mkdir("public/data/gathering", { recursive: true });
await writeFile("public/data/gathering/zones.json", `${JSON.stringify(output, null, 2)}\n`);
console.log(`Built ${zones.length} gathering zone summaries`);
