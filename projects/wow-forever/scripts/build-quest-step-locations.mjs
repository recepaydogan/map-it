/** Build map actions for linked quest pins from ForeverDB's public quest pages. */
import { readFile, writeFile } from "node:fs/promises";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const catalog = await readJson("public/data/quests/quest-details.json");
const dungeonQuests = await readJson("public/data/dungeons/observed-quests.json");
const tables = await readJson("data/client-research/db2-table-names.json");
const assignment = tables.identified.find(({ name }) => name === "UiMapAssignment");
if (!assignment || atlas.source?.uiMapAssignmentFileDataId !== assignment.fileDataId) {
  throw new Error("Atlas UiMapAssignment metadata is missing or mismatched");
}

const slug = (name) => name.normalize("NFKD").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const decode = (text) => text.replace(/<[^>]+>/g, "").replace(/&#(x[0-9a-f]+|\d+);|&([a-z]+);/gi, (_, code, named) => {
  if (code) return String.fromCodePoint(code[0].toLowerCase() === "x"
    ? Number.parseInt(code.slice(1), 16) : Number(code));
  return { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " }[named.toLowerCase()] ?? `&${named};`;
}).trim();
const unpackFloats = (value, count) => {
  const bytes = Buffer.alloc(count * 4);
  for (let index = 0; index < count; index += 1) {
    bytes.writeUInt32LE(Number((value >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
  }
  return Array.from({ length: count }, (_, index) => bytes.readFloatLE(index * 4));
};

const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
let projections;
try {
  const file = `FILE${assignment.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
  const bytes = storage.readFile(file);
  const { reader } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== assignment.layoutHash) {
    throw new Error("UiMapAssignment layout changed");
  }
  const byUiMap = new Map();
  for (const id of reader.getAllIDs()) {
    const uiMapId = reader.getRowRelationship(id);
    const row = reader.getRowData(id);
    if (!Number.isInteger(uiMapId) || row?.[4]?.data !== uiMapId) continue;
    const rows = byUiMap.get(uiMapId) ?? [];
    rows.push({ mapId: row[6].data, worldRegion: unpackFloats(row[2].data, 6),
      uiMin: unpackFloats(row[0].data, 2), uiMax: unpackFloats(row[1].data, 2) });
    byUiMap.set(uiMapId, rows);
  }
  const sameFloats = (a, b) => a?.length === b?.length
    && a.every((number, index) => Math.abs(number - b[index]) < 0.0001);
  for (const layer of atlas.terrainLayers.filter(({ source }) => [0, 1].includes(source?.mapId))) {
    const current = (byUiMap.get(947) ?? []).find(({ mapId }) => mapId === layer.source.mapId);
    if (!current || !sameFloats(current.worldRegion, layer.source.worldRegion)
      || !sameFloats(current.uiMin, layer.source.uiMin)
      || !sameFloats(current.uiMax, layer.source.uiMax)) {
      throw new Error(`Current client world assignment differs from atlas map ${layer.source.mapId}`);
    }
  }
  const project = createClientWorldProjector(atlas);
  projections = (uiMapId, zoneX, zoneY) => {
    const rows = byUiMap.get(uiMapId) ?? [];
    if (rows.length !== 1 || ![0, 1].includes(rows[0].mapId)) return null;
    const { mapId, worldRegion } = rows[0];
    const worldX = worldRegion[3] - zoneY / 100 * (worldRegion[3] - worldRegion[0]);
    const worldY = worldRegion[4] - zoneX / 100 * (worldRegion[4] - worldRegion[1]);
    const point = project(mapId, [worldX, worldY]);
    if (!point || point.x < atlas.bounds.minX || point.x > atlas.bounds.maxX
      || point.y < atlas.bounds.minY || point.y > atlas.bounds.maxY) return null;
    return { x: Number(point.x.toFixed(3)), y: Number(point.y.toFixed(3)) };
  };
} finally {
  storage.close();
}

const mapLinks = (html) => [...html.matchAll(/<a\s+href="\/maps\/(\d+)\?pin=([^",]+),([^",]+),[^"]*"[^>]*>(.*?)<\/a>/g)].flatMap((match) => {
  const uiMapId = Number(match[1]);
  const zoneX = Number(match[2]);
  const zoneY = Number(match[3]);
  const position = projections(uiMapId, zoneX, zoneY);
  if (!position || !Number.isFinite(zoneX) || !Number.isFinite(zoneY)
    || zoneX < 0 || zoneX > 100 || zoneY < 0 || zoneY > 100) return [];
  const suffix = html.slice(match.index + match[0].length).split(/<\/li>|<\/p>|;|<a\s/)[0];
  const observation = /seen in Forever|game quest map, seen by players/i.test(decode(suffix));
  if (!observation) return [];
  return [{ ...position, zone: decode(match[4]).replace(/:\s*[\d.]+,\s*[\d.]+$/, ""), zoneX, zoneY }];
});

function parseQuestPage(html, quest) {
  const title = decode(html.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1] ?? "");
  if (title !== quest.title) return null;
  const start = html.indexOf("<h2>How to complete this quest</h2>");
  if (start < 0) return null;
  const end = html.indexOf("<h2>Quest text", start);
  const body = html.slice(start, end < 0 ? html.indexOf("<h2>Rewards", start) : end);
  const result = { title: quest.title, url: `https://foreverdb.net/quest/${quest.id}-${slug(quest.title)}`,
    pickup: [], objectives: [], handIn: [], earlier: [], following: [] };
  let step = "";
  let currentObjective = null;
  for (const match of body.matchAll(/<(h3|h4|li|p)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) {
    const [, tag, value] = match;
    const label = decode(value);
    if (tag === "h3") {
      step = /^1\./.test(label) ? "pickup" : /^2\./.test(label) ? "objectives"
        : /^3\./.test(label) ? "handIn" : "";
      continue;
    }
    if (tag === "h4" && step === "objectives") {
      const name = label.replace(/\s*\((?:Classic reference|seen in Forever).*\)$/, "");
      currentObjective = { name, locations: [] };
      result.objectives.push(currentObjective);
      continue;
    }
    const locations = mapLinks(value);
    if (!locations.length) continue;
    if (step === "pickup" || step === "handIn") {
      const name = decode(value.match(/<b>(.*?)<\/b>/)?.[1] ?? "");
      for (const location of locations) result[step].push({ name, ...location });
    } else if (step === "objectives") {
      if (!currentObjective) {
        currentObjective = { name: "", locations: [] };
        result.objectives.push(currentObjective);
      }
      currentObjective.locations.push(...locations);
    }
  }
  for (const [heading, field] of [["Earlier quests", "earlier"], ["Following quests", "following"]]) {
    const after = html.split(`<h2>${heading}</h2>`)[1]?.split("<h2>")[0] ?? "";
    result[field] = [...after.matchAll(/href="\/quest\/(\d+)-[^"]+"/g)].map((match) => match[1]);
  }
  result.objectives = result.objectives.filter(({ locations }) => locations.length);
  return result;
}

const questById = { ...catalog.quests, ...Object.fromEntries(dungeonQuests.quests
  .map((quest) => [quest.id, { id: quest.id, title: quest.title }])) };
const ids = [...new Set([...Object.values(catalog.markerQuestIds),
  ...Object.values(catalog.markerDungeonQuests ?? {}).map(({ id }) => id)])]
  .filter((id) => questById[id]).sort((a, b) => Number(a) - Number(b));
const pages = {};
const failed = [];
let placeholderPages = 0;
let cursor = 0;
async function worker() {
  while (cursor < ids.length) {
    const id = ids[cursor++];
    const quest = questById[id];
    const url = `https://foreverdb.net/quest/${id}-${slug(quest.title)}`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) { failed.push(`${id}: HTTP ${response.status}`); continue; }
      const parsed = parseQuestPage(await response.text(), quest);
      if (!parsed) {
        if (response.url.endsWith(`/quest/${id}-quest-${id}`)) { placeholderPages += 1; continue; }
        failed.push(`${id}: page mismatch`);
        continue;
      }
      if (parsed.pickup.length || parsed.handIn.length || parsed.objectives.length
        || parsed.earlier.length || parsed.following.length) pages[id] = parsed;
    } catch (error) { failed.push(`${id}: ${error.message}`); }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
if (failed.length) throw new Error(`Quest pages failed: ${failed.join(", ")}`);
const output = { version: 1, atlasBuild: atlas.source.build, quests: Object.fromEntries(
  Object.entries(pages).sort(([a], [b]) => Number(a) - Number(b))) };
await writeFile("public/data/quests/step-locations.json", `${JSON.stringify(output, null, 2)}\n`);
console.log(`Built ${Object.keys(pages).length} quest steps from ${ids.length} linked quest pages (${placeholderPages} placeholder pages)`);
