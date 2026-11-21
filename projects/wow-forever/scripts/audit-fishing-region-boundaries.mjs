/** Independently rasterize shipped polygons against native terrain area IDs and positions. */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const atlas = await json("public/maps/world-atlas/metadata.json");
const catalog = await json("public/data/gathering/fishing-levels.json");
const boundaries = await json("public/data/gathering/fishing-boundaries.json");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wowf", region: "eu", localeMask: CASC_LOCALE_ENUS, online: false });
const native = (id) => storage.readFile(`FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`);
function* chunks(bytes) {
  for (let start = 0; start + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(start + 4);
    assert.ok(start + 8 + size <= bytes.length);
    yield { tag: bytes.toString("ascii", start, start + 4), offset: start + 8 };
    start += 8 + size;
  }
}
const report = { clientBuild: storage.getProductInfo().buildNumber, atlasBuild: atlas.source.build,
  checkedChunks: 0, matchedCells: 0, maxPositionError: 0, maxGridRoundingError: 0,
  missingAreaIds: [], maps: [], regions: [], limitations: [
    "Terrain AreaIDs describe 33.33-world-unit cells, not exact shorelines or fishing-skill transitions.",
    "Indoor/WMO area overrides are not represented by terrain polygons.",
    "The atlas imagery and current terrain have different build numbers; placement and tile coverage are checked, not pixel content.",
  ] };
try {
  const { reader: areas } = readLocalWdc5(native(1353545));
  const selectedAreas = new Map(catalog.zones.map((zone) => [
    zone.id === "riverglades" ? 16728 : Number(zone.nameKey.split(":")[1]), zone.id,
  ]));
  const unresolved = new Set(), cache = new Map();
  const resolve = (id) => {
    if (cache.has(id)) return cache.get(id);
    let current = id, result = null;
    const visited = new Set();
    while (current && !visited.has(current)) {
      visited.add(current);
      if (selectedAreas.has(current)) { result = selectedAreas.get(current); break; }
      const row = areas.getRowData(current);
      if (!row) { unresolved.add(current); break; }
      current = row[3].data;
    }
    cache.set(id, result);
    return result;
  };
  for (const layer of atlas.terrainLayers) {
    const mapId = layer.source.mapId;
    const metadata = await json(`public/maps/wdt-${layer.source.wdtFileDataId}/metadata.json`);
    const grid = metadata.source.grid;
    const coverage = new Set(layer.tileCoverage[0]);
    const expected = new Map();
    const wdt = native(layer.source.wdtFileDataId);
    const maid = [...chunks(wdt)].find((chunk) => chunk.tag === "DIAM");
    let missingVisualTiles = 0, mapCells = 0;
    for (let tile = 0; tile < 4096; tile++) {
      const id = wdt.readUInt32LE(maid.offset + tile * 32);
      if (!id) continue;
      const tx = tile % 64, ty = Math.floor(tile / 64);
      const bytes = native(id);
      let classified = false;
      for (const chunk of chunks(bytes)) {
        if (chunk.tag !== "KNCM") continue;
        const o = chunk.offset, cx = bytes.readUInt32LE(o + 4), cy = bytes.readUInt32LE(o + 8);
        const gx = tx * 16 + cx, gy = ty * 16 + cy;
        // MCNK's stored world origin independently checks grid axes and tile offsets.
        const error = Math.max(Math.abs(bytes.readFloatLE(o + 104) - (32 - gy / 16) * (1600 / 3)),
          Math.abs(bytes.readFloatLE(o + 108) - (32 - gx / 16) * (1600 / 3)));
        report.maxPositionError = Math.max(report.maxPositionError, error);
        assert.ok(error < 0.02, `Native position mismatch: map ${mapId}, tile ${tx},${ty}`);
        report.checkedChunks++;
        const region = resolve(bytes.readUInt32LE(o + 52));
        if (!region) continue;
        if (!expected.has(region)) expected.set(region, new Set());
        expected.get(region).add(gy * 1024 + gx);
        classified = true;
        mapCells++;
      }
      if (classified && !coverage.has(`${tx - grid.minX},${ty - grid.minY}`)) missingVisualTiles++;
    }
    for (const region of boundaries.regions.filter((entry) => entry.mapId === mapId)) {
      // Invert the actual rendered tile transform, independently of the extractor's projector.
      const rings = region.rings.map((ring) => ring.map(([x, y]) => {
        const gx = ((x - layer.originX) / (layer.tileSize * layer.scaleX) + grid.minX) * 16;
        const gy = ((y - layer.originY) / (layer.tileSize * layer.scaleY) + grid.minY) * 16;
        const error = Math.max(Math.abs(gx - Math.round(gx)), Math.abs(gy - Math.round(gy)));
        report.maxGridRoundingError = Math.max(report.maxGridRoundingError, error);
        assert.ok(error < 0.003, `${region.id} polygon is misaligned with rendered tiles`);
        return [Math.round(gx), Math.round(gy)];
      }));
      const actual = new Set();
      const ys = rings.flatMap((ring) => ring.map((point) => point[1]));
      for (let y = Math.min(...ys); y < Math.max(...ys); y++) {
        const crossings = [];
        for (const ring of rings) for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length];
          if ((a[1] > y + 0.5) !== (b[1] > y + 0.5)) {
            crossings.push(a[0] + (y + 0.5 - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
          }
        }
        crossings.sort((a, b) => a - b);
        assert.equal(crossings.length % 2, 0, `${region.id} has an open ring`);
        for (let i = 0; i < crossings.length; i += 2) {
          for (let x = Math.ceil(crossings[i]); x < crossings[i + 1]; x++) actual.add(y * 1024 + x);
        }
      }
      const nativeCells = expected.get(region.id) ?? new Set();
      const extra = [...actual].filter((cell) => !nativeCells.has(cell)).length;
      const missing = [...nativeCells].filter((cell) => !actual.has(cell)).length;
      report.regions.push({ id: region.id, cells: actual.size, extra, missing });
      report.matchedCells += nativeCells.size - missing;
      assert.equal(extra + missing, 0, `${region.id}: ${extra} extra and ${missing} missing cells`);
      expected.delete(region.id);
    }
    assert.equal(expected.size, 0, "Missing native regions");
    report.maps.push({ mapId, classifiedCells: mapCells, missingVisualTiles });
  }
  report.missingAreaIds = [...unresolved];
  report.withoutTerrainBoundary = catalog.zones.filter((zone) => !boundaries.regions.some((region) => region.id === zone.id)).map((zone) => zone.id);
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/fishing-boundary-audit.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...report, regions: report.regions.length }, null, 2));
} finally { storage.close(); }
