/** Build the existing viewer's tile pyramids from verified PBZ extraction files. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";

const sourceArgument = process.argv.indexOf("--source");
if (sourceArgument < 0 || !process.argv[sourceArgument + 1]) {
  throw new Error("Usage: node scripts/build-game-maps.mjs --source <verified-extraction-directory>");
}
const source = path.resolve(process.argv[sourceArgument + 1]);
const project = path.resolve(import.meta.dirname, "..");
const mapsDirectory = path.join(project, "public", "maps");
const sourceTable = "ProjectPBZ/Content/PBZContent/DataTable/UI/DT_MapData.uasset";
const sourceLocalization = "ProjectPBZ/Content/Localization/Game/en-US/Game.locres";
const sourceAnchors = "ProjectPBZ/Content/PBZContent/Maps/GlobalMapAnchorData.uasset";
const decoded = path.join(source, "decoded");
const tileSize = 512;
const tilePattern = "tiles/{level}/tile{x}x{y}.webp";
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const writeJson = (file, data) => fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
sharp.cache(false);
sharp.concurrency(2);

// Stable app identifiers. Every selected texture is resolved through DT_MapData.
const selections = [
  { id: "world-ground", row: "BigMap", layer: 0, label: "World map · Surface" },
  { id: "world-underground", row: "BigMap", layer: 1, label: "World map · Underground" },
  { id: "xi-gu", row: "XiGu" },
  { id: "fu-ji-zhi-lin", row: "FuJiZhiLin" },
  { id: "fu-ji-zhi-lin-winter", row: "FuJiZhiLin", event: 0, suffix: "Winter" },
  { id: "lu-jia-cun", row: "LuJiaCun" },
  { id: "zheng-dao-da-ying", row: "ZhengDaoDaYing" },
  { id: "pang-zhen", row: "PangZhen" },
  { id: "mei-gu-hu", row: "MeiGuHu" },
  { id: "deng-ding-shan-dao", row: "DengDingShanDao" },
  { id: "duan-hun-shan", row: "DuanHunShan" },
];

function localizationStrings(buffer) {
  let cursor = 0;
  const uint = () => { const value = buffer.readUInt32LE(cursor); cursor += 4; return value; };
  const string = () => {
    const length = buffer.readInt32LE(cursor); cursor += 4;
    const bytes = Math.abs(length) * (length < 0 ? 2 : 1);
    const value = buffer.toString(length < 0 ? "utf16le" : "utf8", cursor, cursor + bytes);
    cursor += bytes;
    return value.replace(/\0$/, "");
  };
  if (buffer.subarray(0, 16).toString("hex") !== "0e147475674a03fc4a15909dc3377f1b" || buffer[16] !== 3) {
    throw new Error("Expected the verified version-3 game localization format.");
  }
  cursor = 17;
  const stringsOffset = Number(buffer.readBigInt64LE(cursor)); cursor += 8;
  const entriesOffset = cursor;
  cursor = stringsOffset;
  const strings = Array.from({ length: uint() }, () => { const value = string(); uint(); return value; });
  cursor = entriesOffset;
  const expected = uint();
  const namespaceCount = uint();
  const result = new Map();
  let count = 0;
  for (let namespaceIndex = 0; namespaceIndex < namespaceCount; namespaceIndex++) {
    uint();
    const namespace = string();
    const entries = uint();
    for (let index = 0; index < entries; index++) {
      uint(); const key = string(); uint(); const stringIndex = uint();
      if (typeof strings[stringIndex] !== "string") throw new Error(`Missing localized string ${stringIndex}.`);
      result.set(`${namespace}:${key}`, strings[stringIndex]);
      count++;
    }
  }
  if (count !== expected || cursor !== stringsOffset) throw new Error("Localization entry validation failed.");
  return result;
}

const table = (await readJson(path.join(decoded, sourceTable.replace(/\.uasset$/, ".json"))))[0].Rows;
const textures = await readJson(path.join(source, "texture-manifest.json"));
const rawManifest = await readJson(path.join(source, "extracted-manifest.json"));
const anchorAsset = (await readJson(path.join(decoded, sourceAnchors.replace(/\.uasset$/, ".json"))))[0];
const anchors = new Map(anchorAsset.Properties.MapData.map(({ Key, Value }) => [Key.toLowerCase(), Value]));
const localizationBuffer = await fs.readFile(path.join(decoded, sourceLocalization));
const localized = localizationStrings(localizationBuffer);
const tableRecord = rawManifest.find((entry) => entry.path === sourceTable);
if (!tableRecord) throw new Error("Map table has no verified source provenance.");

const catalog = [];
for (const selection of selections) {
  const row = table[selection.row];
  const event = selection.event === undefined ? undefined : row.EventMapTextures[selection.event];
  const reference = event?.Value ?? row.MapTextures[selection.layer ?? 0];
  if (!reference?.AssetPathName) throw new Error(`No source texture for ${selection.id}.`);
  const asset = reference.AssetPathName.split(".")[0].replace(/^\/Game\//, "ProjectPBZ/Content/") + ".uasset";
  const texture = textures.find((entry) => entry.asset === asset);
  if (!texture?.mip_dimensions_verified) throw new Error(`Unverified texture ${asset}.`);
  const input = path.join(source, texture.output);
  const inputBytes = await fs.readFile(input);
  if (sha256(inputBytes) !== texture.png_sha256) throw new Error(`Source image changed: ${input}.`);
  const sharedRows = Object.entries(table).filter(([key, candidate]) => key !== "Test" && key !== "BigMap"
    && candidate.MapTextures.some((item) => item.AssetPathName === reference.AssetPathName));
  const nameOf = (candidate) => {
    const key = `${candidate.MapName.Namespace}:${candidate.MapName.Key}`;
    const value = localized.get(key);
    if (!value) throw new Error(`Missing game localization ${key}.`);
    return value;
  };
  const label = selection.label ?? [...new Set((sharedRows.length ? sharedRows.map(([, candidate]) => nameOf(candidate)) : [nameOf(row)]))].join(" / ")
    + (selection.suffix ? ` · ${selection.suffix}` : "");
  const output = path.join(mapsDirectory, selection.id);
  await fs.mkdir(output, { recursive: true });
  const cached = process.argv.includes("--reuse-tiles") ? await readJson(path.join(output, "metadata.json")) : null;
  if (cached && (cached.source?.imageSha256 !== texture.png_sha256 || cached.tileSize !== tileSize
    || cached.bounds.maxX !== texture.width || cached.bounds.maxY !== texture.height)) {
    throw new Error(`Existing tiles have different source data: ${selection.id}.`);
  }
  const detailLevels = cached?.detailLevels ?? [];
  const tileCoverage = cached?.tileCoverage ?? [];
  let tileCount = tileCoverage.reduce((total, level) => total + level.length, 0);
  if (!cached) {
    const { data: pixels, info } = await sharp(inputBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== texture.width || info.height !== texture.height) throw new Error(`Source dimensions changed: ${asset}.`);
  for (let level = 0; ; level++) {
    const width = Math.ceil(info.width / 2 ** level);
    const height = Math.ceil(info.height / 2 ** level);
    const scaled = level === 0 ? { data: pixels, info } : await sharp(pixels, { raw: info })
      .resize(width, height, { kernel: "lanczos3" }).raw().toBuffer({ resolveWithObject: true });
    const columns = Math.ceil(width / tileSize);
    const rows = Math.ceil(height / tileSize);
    const levelDirectory = path.join(output, "tiles", String(level));
    await fs.mkdir(levelDirectory, { recursive: true });
    const coverage = [];
    const jobs = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      coverage.push(`${x},${y}`);
      jobs.push({ x, y });
    }
    // Bound memory and disk concurrency, including on machines running a game.
    for (let start = 0; start < jobs.length; start += 4) {
      await Promise.all(jobs.slice(start, start + 4).map(async ({ x, y }) => {
        const width = Math.min(tileSize, scaled.info.width - x * tileSize);
        const height = Math.min(tileSize, scaled.info.height - y * tileSize);
        let image = sharp(scaled.data, { raw: scaled.info }).extract({ left: x * tileSize, top: y * tileSize, width, height });
        if (width !== tileSize || height !== tileSize) {
          image = image.extend({ top: 0, left: 0, right: tileSize - width, bottom: tileSize - height, background: "#00000000" });
        }
        await image.webp({ lossless: true, effort: 4 }).toFile(path.join(levelDirectory, `tile${x}x${y}.webp`));
      }));
    }
    detailLevels.push(level);
    tileCoverage.push(coverage);
    tileCount += jobs.length;
    console.log(`${selection.id}: level ${level}, ${columns} × ${rows} tiles`);
    if (columns === 1 && rows === 1) break;
  }
  } else {
    console.log(`${selection.id}: reused ${tileCount} tiles from the identical source image`);
  }
  const sourceRows = selection.row === "BigMap" ? [[selection.row, row]] : (sharedRows.length ? sharedRows : [[selection.row, row]]);
  const metadata = {
    schemaVersion: 1,
    bounds: { minX: 0, minY: 0, maxX: texture.width, maxY: texture.height },
    tileSize, detailLevels, tilePattern, tileCoverage,
    tileEncoding: "webp-lossless",
    backgroundColor: "#151719", regions: [], locations: [],
    source: {
      gameBuild: "26266538", asset, assetSha256: texture.source_sha256, imageSha256: texture.png_sha256,
      mapTable: sourceTable, mapTableSha256: tableRecord.sha256,
      records: sourceRows.map(([key, value]) => ({ row: key, mapId: value.MapID, levelName: value.LevelName, declaredLayers: value.LayerNum,
        anchorCount: anchors.get(value.MapID.toLowerCase())?.AnchorData.length ?? 0 })),
      ...(selection.layer !== undefined ? { textureIndex: selection.layer } : {}),
      ...(event ? { eventTag: event.Key.TagName } : {}),
    },
  };
  await writeJson(path.join(output, "metadata.json"), metadata);
  catalog.push({ id: selection.id, name: label, nameKey: `map.maps.names.${selection.id}`, width: texture.width, height: texture.height,
    tileSize, detailLevels, tileCount, source: metadata.source });
}

const expectedAssets = new Set(Object.values(table).flatMap((row) => [
  ...row.MapTextures.map((item) => item.AssetPathName.split(".")[0]),
  ...row.EventMapTextures.map((item) => item.Value.AssetPathName.split(".")[0]),
]).filter(Boolean));
const importedAssets = new Set(catalog.map((map) => map.source.asset.replace(/^ProjectPBZ\/Content\//, "/Game/").replace(/\.uasset$/, "")));
if (expectedAssets.size !== importedAssets.size || [...expectedAssets].some((asset) => !importedAssets.has(asset))) {
  throw new Error("Not every referenced map texture was included.");
}
const localePath = path.join(project, "src", "i18n", "locales", "en.json");
const originalLocale = await fs.readFile(localePath, "utf8");
const locale = JSON.parse(originalLocale);
locale.map.maps.names = Object.fromEntries(catalog.map(({ id, name }) => [id, name]));
locale.map.maps.backToWorld = "Back to world map";
let localeOutput = `${JSON.stringify(locale, null, 2)}\n`;
if (originalLocale.includes("\r\n")) localeOutput = localeOutput.replace(/\n/g, "\r\n");
await fs.writeFile(localePath, localeOutput);
const catalogDirectory = path.join(project, "public", "data", "maps");
await fs.mkdir(catalogDirectory, { recursive: true });
await writeJson(path.join(catalogDirectory, "catalog.json"), {
  schemaVersion: 1, source: { gameBuild: "26266538", table: sourceTable, tableSha256: tableRecord.sha256,
    localization: sourceLocalization, localizationSha256: sha256(localizationBuffer) }, maps: catalog,
});
console.log(`Imported ${catalog.length} maps, ${catalog.reduce((total, map) => total + map.tileCount, 0)} lossless WebP tiles.`);
