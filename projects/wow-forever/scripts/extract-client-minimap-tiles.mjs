/** Discover WDT maps and extract their minimap tiles from a local CASC install. */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import BLPFile from "js-blp";
import sharp from "sharp";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || !value) {
    throw new Error("Usage: node scripts/extract-client-minimap-tiles.mjs --install <game-dir> --product <casc-product> --mode discover|extract [--wdt-id <id>]");
  }
  options.set(key.slice(2), value);
}
const installDir = resolve(options.get("install") ?? process.env.CASC_INSTALL_DIR ?? "");
const product = options.get("product") ?? process.env.CASC_PRODUCT;
const mode = options.get("mode");
const wdtId = Number(options.get("wdt-id"));
if (!existsSync(join(installDir, ".build.info")) || !product) {
  throw new Error("Provide a local CASC game installation and product code.");
}
if (mode !== "discover" && mode !== "extract") throw new Error("--mode must be discover or extract.");
if (mode === "extract" && (!Number.isSafeInteger(wdtId) || wdtId <= 0)) {
  throw new Error("--wdt-id must be a positive FileDataID.");
}

const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const sourceHash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const tileName = (level, x, y) => join("tiles", String(level), `tile${x}x${y}.webp`);
const replace = options.get("replace") === "true";

// Client minimaps mix several flat void/sea colors into otherwise continuous
// coastline art. Remove those source pixels so every tile shares one sea color.
const clearFlatBackdrop = (pixels) => {
  const colors = new Set();
  let darkPixels = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const darkVoid = red <= 18 && green <= 45 && blue <= 24;
    if (darkVoid) darkPixels += 1;
    if (colors.size <= 64) colors.add((red << 16) | (green << 8) | blue);
    const grayVoid = Math.abs(red - 126) <= 2 && Math.abs(green - 127) <= 2
      && Math.abs(blue - 126) <= 2;
    const flatSea = red <= 42 && green >= 43 && green <= 65
      && blue >= 55 && blue <= 90 && blue >= green + 8 && green >= red + 8;
    if (darkVoid || grayVoid || flatSea) {
      pixels[offset] = 9;
      pixels[offset + 1] = 38;
      pixels[offset + 2] = 52;
      pixels[offset + 3] = 0;
    }
  }
  // Some client tiles are almost entirely void, with a few flat-color pixels
  // forming a straight rectangular artifact. Detailed islands have far more
  // colors, so preserve those while discarding low-information void tiles.
  if (darkPixels > pixels.length / 4 * 0.75 && colors.size <= 64) {
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels[offset] = 9;
      pixels[offset + 1] = 38;
      pixels[offset + 2] = 52;
      pixels[offset + 3] = 0;
    }
  }
  return pixels;
};

// Some battleground minimaps have a second, opaque gray/black void surrounding
// their terrain. Clear only neutral pixels connected to the outer edge so
// neutral colors inside the playable map remain intact.
const clearConnectedBattlegroundVoid = (tiles, columns, rows, tileSize, wdtId) => {
  if (tiles.size !== columns * rows || tiles.size > 35) {
    throw new Error("Battleground minimap no longer has its verified complete tile layout.");
  }
  const width = columns * tileSize;
  const height = rows * tileSize;
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const pixel = (index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const tile = tiles.get(`${Math.floor(x / tileSize)},${Math.floor(y / tileSize)}`);
    if (!tile) throw new Error(`Missing native battleground tile at ${x},${y}.`);
    const offset = ((y % tileSize) * tileSize + x % tileSize) * 4;
    return { tile, offset };
  };
  const add = (index) => {
    if (seen[index]) return;
    seen[index] = 1;
    const { tile, offset } = pixel(index);
    const red = tile[offset];
    const green = tile[offset + 1];
    const blue = tile[offset + 2];
    const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
    const neutralVoid = spread <= 5 && red >= 15 && red <= 150;
    const arathiOliveVoid = wdtId === 790377 && Math.abs(red - 56) <= 8
      && Math.abs(green - 60) <= 8 && Math.abs(blue - 24) <= 8;
    if (tile[offset + 3] === 0 || !neutralVoid && !arathiOliveVoid) return;
    queue[tail++] = index;
    tile[offset] = 9;
    tile[offset + 1] = 38;
    tile[offset + 2] = 52;
    tile[offset + 3] = 0;
  };
  for (let x = 0; x < width; x += 1) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    add(y * width);
    add(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    if (x > 0) add(index - 1);
    if (x + 1 < width) add(index + 1);
    if (index >= width) add(index - width);
    if (index + width < width * height) add(index + width);
  }
  console.log(`Cleared ${tail} connected backdrop pixels from native battleground terrain.`);
};

const parseWdt = (bytes, id) => {
  if (bytes.subarray(0, 4).toString("ascii") !== "REVM") {
    throw new Error(`FileDataID ${id} is not a WDT file.`);
  }
  let maid = null;
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const kind = bytes.subarray(offset, offset + 4).toString("ascii");
    const size = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + size > bytes.length) throw new Error(`Invalid WDT chunk ${kind} in ${id}.`);
    if (kind === "DIAM") maid = bytes.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size;
  }
  if (!maid || maid.length !== 64 * 64 * 32) throw new Error(`WDT ${id} has no 64 × 64 MAID tile table.`);
  const tiles = [];
  for (let index = 0; index < 64 * 64; index += 1) {
    const fileDataId = maid.readUInt32LE(index * 32 + 28);
    if (fileDataId) tiles.push({ x: index % 64, y: Math.floor(index / 64), fileDataId });
  }
  return tiles;
};

const storage = new Storage();
storage.openEx(installDir, { codeName: product, region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const opened = storage.getProductInfo();
  if (opened.codeName !== product) throw new Error(`Opened ${opened.codeName}, expected ${product}.`);
  if (mode === "discover") {
    const maps = [];
    let inspected = 0;
    try {
      for (let entry = storage.findFirstFile("*"); entry; entry = storage.findNextFile()) {
        // The WDT content flag narrows the local archive to map roots. The magic
        // and MAID structure are still checked before accepting a candidate.
        if (!entry.available || entry.contentFlags !== 307101696 || entry.fileSize < 131072) continue;
        inspected += 1;
        let tiles;
        try {
          tiles = parseWdt(storage.readFile(entry.fileName), entry.fileDataId);
        } catch {
          continue;
        }
        if (!tiles.length) continue;
        const xs = tiles.map((tile) => tile.x);
        const ys = tiles.map((tile) => tile.y);
        maps.push({
          wdtFileDataId: entry.fileDataId,
          tileCount: tiles.length,
          grid: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
          availableTiles: tiles.filter(({ fileDataId }) => {
            const info = storage.getFileInfo(fileName(fileDataId));
            return info && info.size !== 0xffff_ffff;
          }).length,
        });
      }
    } finally {
      storage.findClose();
    }
    maps.sort((a, b) => b.tileCount - a.tileCount || a.wdtFileDataId - b.wdtFileDataId);
    const output = join(projectRoot, "data", "client-map-extraction", "wdt-index.json");
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify({ source: { product, build: opened.buildNumber, installDir }, inspected, maps }, null, 2)}\n`);
    console.log(`Discovered ${maps.length} local WDT maps from build ${opened.buildNumber}: ${output}`);
  } else {
    const wdtBytes = storage.readFile(fileName(wdtId));
    const sourceTiles = parseWdt(wdtBytes, wdtId);
    if (!sourceTiles.length) throw new Error(`WDT ${wdtId} has no minimap tiles.`);
    const minX = Math.min(...sourceTiles.map((tile) => tile.x));
    const minY = Math.min(...sourceTiles.map((tile) => tile.y));
    const maxX = Math.max(...sourceTiles.map((tile) => tile.x));
    const maxY = Math.max(...sourceTiles.map((tile) => tile.y));
    const columns = maxX - minX + 1;
    const rows = maxY - minY + 1;
    const output = join(projectRoot, "public", "maps", `wdt-${wdtId}`);
    if (existsSync(output) && !replace) throw new Error(`Output already exists: ${output}`);
    await mkdir(dirname(output), { recursive: true });
    const stagingRoot = resolve(tmpdir());
    const stage = await mkdtemp(join(stagingRoot, `wow-map-wdt-${wdtId}-`));
    const available = new Map();
    const rawBattlegroundTiles = [790112, 790291, 790377].includes(wdtId) ? new Map() : null;
    const missing = [];
    let tileSize = null;
    for (const [index, tile] of sourceTiles.entries()) {
      let bytes;
      try {
        bytes = storage.readFile(fileName(tile.fileDataId));
      } catch (error) {
        if (error?.codeName !== "ERROR_FILE_NOT_FOUND") throw error;
        missing.push(tile.fileDataId);
        continue;
      }
      const blp = new BLPFile(bytes);
      if (blp.width !== blp.height || ![256, 512].includes(blp.width)) {
        throw new Error(`Unsupported minimap BLP ${tile.fileDataId}: ${blp.width} × ${blp.height}.`);
      }
      if (tileSize === null) tileSize = blp.width;
      if (blp.width !== tileSize) throw new Error(`Mixed tile sizes in WDT ${wdtId}.`);
      const x = tile.x - minX;
      const y = tile.y - minY;
      const path = join(stage, tileName(0, x, y));
      await mkdir(dirname(path), { recursive: true });
      const pixels = clearFlatBackdrop(blp.getPixels(0).readBuffer());
      if (rawBattlegroundTiles) rawBattlegroundTiles.set(`${x},${y}`, pixels);
      else await sharp(pixels, { raw: { width: tileSize, height: tileSize, channels: 4 } })
        .webp({ quality: 86, alphaQuality: 100, effort: 3 }).toFile(path);
      available.set(`${x},${y}`, path);
      if ((index + 1) % 100 === 0) console.log(`WDT ${wdtId}: ${index + 1}/${sourceTiles.length} native tiles`);
    }
    if (rawBattlegroundTiles) {
      clearConnectedBattlegroundVoid(rawBattlegroundTiles, columns, rows, tileSize, wdtId);
      for (const [key, pixels] of rawBattlegroundTiles) {
        await sharp(pixels, { raw: { width: tileSize, height: tileSize, channels: 4 } })
          .webp({ quality: 86, alphaQuality: 100, effort: 3 }).toFile(available.get(key));
      }
    }
    if (!available.size) throw new Error(`No locally available minimap textures for WDT ${wdtId}.`);
    const coverage = [[...available.keys()]];
    const detailLevels = [0];
    let level = 0;
    let levelColumns = columns;
    let levelRows = rows;
    while (levelColumns > 1 || levelRows > 1) {
      const next = new Map();
      const nextColumns = Math.ceil(levelColumns / 2);
      const nextRows = Math.ceil(levelRows / 2);
      for (let y = 0; y < nextRows; y += 1) {
        for (let x = 0; x < nextColumns; x += 1) {
          const parts = [];
          for (let dy = 0; dy < 2; dy += 1) {
            for (let dx = 0; dx < 2; dx += 1) {
              const input = available.get(`${x * 2 + dx},${y * 2 + dy}`);
              if (input) parts.push({ input, left: dx * tileSize, top: dy * tileSize });
            }
          }
          if (!parts.length) continue;
          const merged = await sharp({ create: {
            width: tileSize * 2, height: tileSize * 2, channels: 4, background: "#00000000",
          } }).composite(parts).png().toBuffer();
          const path = join(stage, tileName(level + 1, x, y));
          await mkdir(dirname(path), { recursive: true });
          await sharp(merged).resize(tileSize, tileSize)
            .webp({ quality: 86, alphaQuality: 100, effort: 3 }).toFile(path);
          next.set(`${x},${y}`, path);
        }
      }
      available.clear();
      for (const [key, value] of next) available.set(key, value);
      level += 1;
      levelColumns = nextColumns;
      levelRows = nextRows;
      detailLevels.push(level);
      coverage.push([...available.keys()]);
      console.log(`WDT ${wdtId}: detail level ${level}, ${available.size} tiles`);
    }
    const metadata = {
      schemaVersion: 1,
      bounds: { minX: 0, minY: 0, maxX: columns * tileSize, maxY: rows * tileSize },
      tileSize,
      detailLevels,
      tileCoverage: coverage,
      tilePattern: "tiles/{level}/tile{x}x{y}.webp",
      backgroundColor: "#092634",
      regions: [],
      locations: [],
      source: { product, build: opened.buildNumber, wdtFileDataId: wdtId, wdtSha256: sourceHash(wdtBytes),
        grid: { minX, minY, maxX, maxY }, tileCount: sourceTiles.length, missingFileDataIds: missing, coverage },
    };
    await writeFile(join(stage, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
    if (!stage.startsWith(`${stagingRoot}${sep}`) || !output.startsWith(`${join(projectRoot, "public", "maps")}${sep}`)) {
      throw new Error(`Unsafe staging directory: ${stage}`);
    }
    await cp(stage, output, { recursive: true, errorOnExist: !replace, force: replace });
    for (const [detailLevel, expected] of coverage.entries()) {
      const actual = (await readdir(join(output, "tiles", String(detailLevel)))).filter((name) => name.endsWith(".webp"));
      if (actual.length !== expected.length) throw new Error(`Incomplete copied level ${detailLevel} in ${output}.`);
    }
    let cleaned = false;
    for (let attempt = 0; attempt < 5 && !cleaned; attempt += 1) {
      try {
        await rm(stage, { recursive: true });
        cleaned = true;
      } catch (error) {
        if (error?.code !== "EBUSY" && error?.code !== "EPERM") throw error;
        if (attempt < 4) await new Promise((done) => setTimeout(done, 2_000));
      }
    }
    if (!cleaned) console.warn(`Copied tiles are complete, but temporary files remain locked: ${stage}`);
    console.log(`Extracted WDT ${wdtId}: ${sourceTiles.length - missing.length}/${sourceTiles.length} native tiles, ${detailLevels.length} levels, ${output}`);
  }
} finally {
  storage.close();
}
