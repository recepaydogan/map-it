/** Reviewed fishing reference levels, projected with the app's native atlas coordinates.
 * Minimum skills: https://www.wowhead.com/forever/guide/professions/fishing/overview-leveling#fishing-requirements-by-zone-in-forever
 * No-escape targets including equipment and lures: https://github.com/rynmon/OneCast/blob/main/ZoneLevels.lua.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const atlas = await read("public/maps/world-atlas/metadata.json");
const assignments = (await read("public/data/gep-map-projection.json")).assignments;
const en = await read("src/i18n/locales/en.json");
const source = await read("public/data/locales/wow-forever/source.json");
const project = createClientWorldProjector(atlas);
const areaKey = (name) => source.keys.find((key, index) => /^AreaTable:\d+:1$/.test(key) && source.values[index] === name);
const groups = [
  [1, 25, [[1429, "Elwynn Forest"], [1426, "Dun Morogh"], [1438, "Teldrassil"], [1411, "Durotar"], [1412, "Mulgore"], [1420, "Tirisfal Glades"]]],
  [1, 75, [[1436, "Westfall"], [1432, "Loch Modan"], [1421, "Silverpine Forest"], [1439, "Darkshore"], [1453, "Stormwind City"], [1455, "Ironforge"], [1457, "Darnassus"], [1454, "Orgrimmar"], [1456, "Thunder Bluff"], [1458, "Undercity"]]],
  [1, 100, [[1413, "The Barrens"]]],
  [55, 150, [[1440, "Ashenvale"], [1431, "Duskwood"], [1424, "Hillsbrad Foothills"], [1433, "Redridge Mountains"], [1442, "Stonetalon Mountains"], [1437, "Wetlands"]]],
  [130, 225, [[1416, "Alterac Mountains"], [1417, "Arathi Highlands"], [1443, "Desolace"], [1445, "Dustwallow Marsh"], [1434, "Stranglethorn Vale"], [1435, "Swamp of Sorrows"], [1441, "Thousand Needles"]]],
  [205, 300, [[1447, "Azshara"], [1448, "Felwood"], [1444, "Feralas"], [1450, "Moonglade"], [1446, "Tanaris"], [1425, "The Hinterlands"], [1449, "Un'Goro Crater"], [1422, "Western Plaguelands"]]],
  [330, 425, [[1428, "Burning Steppes"], [1430, "Deadwind Pass"], [1423, "Eastern Plaguelands"], [1451, "Silithus"], [1452, "Winterspring"]]],
];
const zones = [];
const add = (name, minimumSkill, noEscapeSkill, position, options = {}) => {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new Error(`No position for ${name}`);
  zones.push({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, ""), name,
    nameKey: areaKey(name), minimumSkill, noEscapeSkill, x: Math.round(position.x * 1000) / 1000,
    y: Math.round(position.y * 1000) / 1000, kind: "zone", evidence: "classic", ...options });
};
for (const [minimumSkill, noEscapeSkill, entries] of groups) for (const [uiMapId, name] of entries) {
  const a = assignments.find((entry) => entry.uiMapId === uiMapId);
  if (!a) throw new Error(`Missing UiMapAssignment ${uiMapId}`);
  const r = a.worldRegion;
  add(name, minimumSkill, noEscapeSkill, project(a.worldMapId, [(r[0] + r[3]) / 2, (r[1] + r[4]) / 2]), {
    uiMapId, kind: uiMapId >= 1453 && uiMapId <= 1458 ? "city" : "zone",
    evidence: name === "The Barrens" ? "reported" : "classic",
  });
}
// New zones use the median of unique published location coordinates as a label
// anchor, not as a fishing spawn. This keeps them on the app's actual terrain.
const points = [];
for (const file of (await readdir("public/maps/world-atlas")).filter((file) => /^locations-.*\.json$/.test(file))) {
  points.push(...((await read(`public/maps/world-atlas/${file}`)).locations ?? []));
}
const text = (value, key) => value || key?.split(".").reduce((object, part) => object?.[part], en);
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
// Riverglades has no independently verified current minimum for this stretch of coast.
for (const [name, minimumSkill, noEscapeSkill] of [["Zephras Isle", 1, 25], ["Riverglades", null, 225], ["Mount Hyjal", null, null], ["Shen'dralas", null, null], ["City of Dalaran", null, null]]) {
  const matches = [...new Map(points.filter((p) => text(p.region, p.regionKey) === name)
    .map((p) => [`${p.x}:${p.y}`, p])).values()];
  if (!matches.length) throw new Error(`No published region anchors: ${name}`);
  add(name, minimumSkill, noEscapeSkill, { x: median(matches.map((p) => p.x)), y: median(matches.map((p) => p.y)) }, {
    evidence: noEscapeSkill === null ? "unknown" : "reported", ...(name === "Riverglades" ? { scope: "coast" } : {}),
  });
}
// Water-specific targets become visible when zooming into their parent region.
// Named published landmarks anchor the label; they are not advertised as fishing pins.
for (const [name, minimumSkill, noEscapeSkill, landmark] of [
  ["Jaguero Isle", 205, 300, "Jaguero Stalker"],
  ["Bay of Storms", 330, 425, "Loramus Thalipedes"],
  ["Hetaera's Clutch", 330, 425, "Hetaera's Clutch"],
  ["Scalebeard's Cave", 330, 425, "Scalebeard's Cave"],
]) {
  const point = points.find((p) => text(p.name, p.nameKey) === landmark);
  add(name, minimumSkill, noEscapeSkill, point, { kind: "water" });
}
// Jademir Lake's reference label: Feralas 48,11 (Wowhead Plated Armorfish reports).
const feralas = assignments.find((a) => a.uiMapId === 1444);
const r = feralas.worldRegion;
add("Jademir Lake", 330, 425, project(feralas.worldMapId,
  [r[3] - (r[3] - r[0]) * 0.11, r[4] - (r[4] - r[1]) * 0.48]), { kind: "water" });
await writeFile("public/data/gathering/fishing-levels.json", `${JSON.stringify({ version: 2, mapId: "azeroth", zones }, null, 2)}\n`);
console.log(`Built ${zones.length} fishing level labels.`);
