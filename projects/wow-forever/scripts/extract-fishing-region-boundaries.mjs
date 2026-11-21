/** Trace actual MCNK area cells, resolving subareas through the client's AreaTable.
 * No rectangles, convex hulls, or guessed borders: every edge belongs to native terrain.
 */
import { readFile, writeFile } from "node:fs/promises";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const atlas = JSON.parse(await readFile("public/maps/world-atlas/metadata.json", "utf8"));
const catalog = JSON.parse(await readFile("public/data/gathering/fishing-levels.json", "utf8"));
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const chunks = (bytes) => {
  const result = [];
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4);
    if (offset + size + 8 > bytes.length) throw new Error("Truncated native chunk");
    result.push({ name: bytes.toString("ascii", offset, offset + 4).split("").reverse().join(""), offset: offset + 8, size });
    offset += size + 8;
  }
  return result;
};
const project = createClientWorldProjector(atlas);
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wowf", region: "eu", localeMask: CASC_LOCALE_ENUS, online: false });
const regions = [];
let tileCount = 0;
try {
  const { reader: areas, omittedSections } = readLocalWdc5(storage.readFile(fileName(1353545)));
  if (areas.layoutHash.toString(16) !== "9995b797"
    || areas.getRowData(12)?.[1]?.string !== "Elwynn Forest") throw new Error("AreaTable layout or availability changed");
  const byName = new Map(catalog.zones.map((zone) => [zone.name, zone.id]));
  // The reported Riverglades skill applies to Eastwind Shore, not the whole zone.
  byName.delete("Riverglades");
  byName.set("Eastwind Shore", "riverglades");
  const resolved = new Map();
  const resolve = (areaId) => {
    if (resolved.has(areaId)) return resolved.get(areaId);
    const seen = new Set();
    let current = areaId;
    let result = null;
    while (current && !seen.has(current)) {
      seen.add(current);
      const row = areas.getRowData(current);
      if (!row) break;
      if (byName.has(row[1]?.string)) { result = byName.get(row[1].string); break; }
      current = row[3]?.data;
    }
    resolved.set(areaId, result);
    return result;
  };
  for (const layer of atlas.terrainLayers) {
    const mapId = layer.source.mapId;
    if (![0, 1, 2991].includes(mapId)) continue;
    const wdt = storage.readFile(fileName(layer.source.wdtFileDataId));
    const maid = chunks(wdt).find((chunk) => chunk.name === "MAID");
    if (maid?.size !== 4096 * 32) throw new Error(`Invalid MAID for map ${mapId}`);
    const cells = new Map();
    for (let tile = 0; tile < 4096; tile++) {
      const rootAdt = wdt.readUInt32LE(maid.offset + tile * 32);
      if (!rootAdt) continue;
      const bytes = storage.readFile(fileName(rootAdt));
      const tileX = tile % 64, tileY = Math.floor(tile / 64);
      for (const chunk of chunks(bytes)) {
        if (chunk.name !== "MCNK") continue;
        if (chunk.size < 128) throw new Error(`Invalid MCNK in ${rootAdt}`);
        const x = bytes.readUInt32LE(chunk.offset + 4), y = bytes.readUInt32LE(chunk.offset + 8);
        if (x >= 16 || y >= 16) throw new Error(`Invalid MCNK coordinates in ${rootAdt}`);
        const id = resolve(bytes.readUInt32LE(chunk.offset + 52));
        if (id) cells.set((tileY * 16 + y) * 1024 + tileX * 16 + x, id);
      }
      tileCount++;
      if (tileCount % 250 === 0) console.log(`Read ${tileCount} terrain tiles`);
    }
    const edgesByRegion = new Map();
    // Interior label anchors: distance from native area edges, not a rectangular map midpoint.
    const distance = new Map();
    const queue = [];
    for (const [cell, id] of cells) {
      if ([-1024, 1, 1024, -1].some((offset) => cells.get(cell + offset) !== id)) {
        distance.set(cell, 1);
        queue.push(cell);
      }
    }
    const anchors = new Map();
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head], id = cells.get(cell), depth = distance.get(cell);
      if (!anchors.has(id) || anchors.get(id).depth < depth) anchors.set(id, { cell, depth });
      for (const offset of [-1024, 1, 1024, -1]) {
        const next = cell + offset;
        if (cells.get(next) === id && !distance.has(next)) { distance.set(next, depth + 1); queue.push(next); }
      }
    }
    const edge = (id, x1, y1, x2, y2) => {
      if (!edgesByRegion.has(id)) edgesByRegion.set(id, []);
      edgesByRegion.get(id).push([[x1, y1], [x2, y2]]);
    };
    for (const [cell, id] of cells) {
      const x = cell % 1024, y = Math.floor(cell / 1024);
      if (cells.get(cell - 1024) !== id) edge(id, x, y, x + 1, y);
      if (x === 1023 || cells.get(cell + 1) !== id) edge(id, x + 1, y, x + 1, y + 1);
      if (cells.get(cell + 1024) !== id) edge(id, x + 1, y + 1, x, y + 1);
      if (x === 0 || cells.get(cell - 1) !== id) edge(id, x, y + 1, x, y);
    }
    for (const [id, edges] of edgesByRegion) {
      const outgoing = new Map();
      const key = ([x, y]) => y * 1025 + x;
      for (const [a, b] of edges) {
        if (!outgoing.has(key(a))) outgoing.set(key(a), []);
        outgoing.get(key(a)).push(b);
      }
      const rings = [];
      while (outgoing.size) {
        const startKey = outgoing.keys().next().value;
        const start = [startKey % 1025, Math.floor(startKey / 1025)];
        const ring = [start];
        let current = start;
        do {
          const next = outgoing.get(key(current));
          if (!next?.length) throw new Error(`Open native boundary: ${id}`);
          const point = next.pop();
          if (!next.length) outgoing.delete(key(current));
          ring.push(point);
          current = point;
        } while (key(current) !== startKey);
        // Remove only collinear vertices; preserve the native area edge exactly.
        const corners = ring.slice(0, -1).filter((point, i, all) => {
          const prev = all[(i + all.length - 1) % all.length], next = all[(i + 1) % all.length];
          return (point[0] - prev[0]) * (next[1] - point[1]) !== (point[1] - prev[1]) * (next[0] - point[0]);
        });
        if (corners.length < 3) continue;
        rings.push(corners.map(([x, y]) => {
          const point = project(mapId, [(32 - y / 16) * (1600 / 3), (32 - x / 16) * (1600 / 3)]);
          return [Math.round(point.x * 10) / 10, Math.round(point.y * 10) / 10];
        }));
      }
      if (rings.length) {
        const cell = anchors.get(id).cell;
        const x = cell % 1024 + 0.5, y = Math.floor(cell / 1024) + 0.5;
        const label = project(mapId, [(32 - y / 16) * (1600 / 3), (32 - x / 16) * (1600 / 3)]);
        regions.push({ id, mapId, label: { x: Math.round(label.x * 10) / 10, y: Math.round(label.y * 10) / 10 }, rings });
      }
    }
    console.log(`Map ${mapId}: ${cells.size} classified area cells, ${edgesByRegion.size} regions`);
  }
  const output = { version: 1, source: { build: storage.getProductInfo().buildNumber,
    kind: "native-mcnk-area-boundaries", cellWorldSize: 100 / 3, tileCount,
    omittedAreaSections: omittedSections.length }, regions };
  await writeFile("public/data/gathering/fishing-boundaries.json", `${JSON.stringify(output)}\n`);
  console.log(`Saved ${regions.length} native region boundaries.`);
} finally { storage.close(); }
