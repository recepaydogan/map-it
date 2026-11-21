import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import sharp from "sharp";

const [itemTablePath, iconTablePath, ...textureRoots] = process.argv.slice(2);
if (!itemTablePath || !iconTablePath || !textureRoots.length) {
  throw new Error("Usage: node scripts/build-item-icons.mjs <decoded-items.json> <decoded-icon-table.json> <exported-texture-root> [additional-texture-root...]");
}

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const output = resolve("public/data/items");
const catalogPath = join(output, "catalog.json");
const manifestPath = join(output, "source-manifest.json");
const catalog = await readJson(catalogPath);
const manifest = await readJson(manifestPath);
const itemTable = await readJson(itemTablePath);
const exports = await readJson(iconTablePath);
const tables = exports.filter((entry) => entry.Type === "DataTable" && entry.Rows);
if (tables.length !== 1) throw new Error("Expected one decoded icon data table");
const iconTable = tables[0];
const rows = new Map(itemTable.Properties.Data.map((row) => [String(row.ID.Value), row]));
if (rows.size !== itemTable.Properties.Data.length) throw new Error("Duplicate source item IDs");
const icons = new Map(Object.entries(iconTable.Rows).map(([key, value]) => [key.toLowerCase(), value]));

// Resource keys are aliases. Resolve the complete package path, never a similar filename.
const textures = new Map();
for (const root of textureRoots) {
  for (const relative of await readdir(root, { recursive: true })) {
    const normalized = relative.replaceAll("\\", "/");
    const contentIndex = normalized.toLowerCase().indexOf("/content/");
    if (contentIndex < 0 || !normalized.endsWith(".png")) continue;
    const asset = `/Game/${normalized.slice(contentIndex + 9, -4)}`.toLowerCase();
    const path = join(root, relative);
    if (textures.has(asset) && hash(await readFile(textures.get(asset))) !== hash(await readFile(path))) {
      throw new Error(`Conflicting texture exports: ${asset}`);
    }
    textures.set(asset, path);
  }
}

const planned = [];
const assets = new Map();
const missing = [];
for (const item of catalog.items) {
  const row = rows.get(item.id);
  if (!row) throw new Error(`Missing source item: ${item.id}`);
  const entry = icons.get(row.IconRes.toLowerCase());
  const reference = entry?.ResourceObject_Global?.AssetPathName || entry?.ResourceObject?.AssetPathName;
  const assetPath = reference?.split(".")[0];
  const source = assetPath && textures.get(assetPath.toLowerCase());
  if (!source) {
    missing.push({ id: item.id, iconKey: row.IconRes, assetPath });
    continue;
  }
  if (!assets.has(assetPath)) {
    const bytes = await readFile(source);
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height) throw new Error(`Invalid PNG: ${source}`);
    assets.set(assetPath, { source, sha256: hash(bytes), width: metadata.width, height: metadata.height });
  }
  planned.push({ item, iconKey: row.IconRes, assetPath });
}
if (missing.length) {
  throw new Error(`Missing ${missing.length} exact icon mappings/textures:\n${JSON.stringify(missing, null, 2)}`);
}

// Keep existing matching assets to avoid duplicating verified PNGs on subsequent imports.
const existing = new Map();
for (const file of (await readdir(join(output, "icons"))).sort()) {
  if (file.endsWith(".png")) existing.set(hash(await readFile(join(output, "icons", file))), `data/items/icons/${file}`);
}
const usedPaths = new Map();
for (const [assetPath, asset] of assets) {
  const filename = basename(assetPath).toLowerCase().replaceAll("_", "-") + ".png";
  asset.path = existing.get(asset.sha256) ?? `data/items/icons/${filename}`;
  if (usedPaths.has(asset.path) && usedPaths.get(asset.path) !== asset.sha256) throw new Error(`Conflicting output: ${asset.path}`);
  usedPaths.set(asset.path, asset.sha256);
}

const provenance = {
  version: 1,
  inputs: [itemTablePath, iconTablePath].map((path) => ({ name: basename(path) })),
  iconTable: iconTable.Package ?? iconTable.Name,
  assets: [...assets].map(([assetPath, { path, sha256, width, height }]) => ({ assetPath, path, sha256, width, height })),
  items: planned.map(({ item, iconKey, assetPath }) => ({ id: item.id, iconKey, assetPath })),
};
for (let index = 0; index < provenance.inputs.length; index++) {
  provenance.inputs[index].sha256 = hash(await readFile([itemTablePath, iconTablePath][index]));
}
await mkdir(join(output, "icons"), { recursive: true });
for (const asset of assets.values()) {
  if (!existing.has(asset.sha256)) await copyFile(asset.source, resolve("public", asset.path));
}
const added = planned.filter(({ item }) => !item.icon).length;
let corrected = 0;
for (const { item, assetPath } of planned) {
  const path = assets.get(assetPath).path;
  if (item.icon && item.icon !== path) corrected++;
  item.icon = path;
}
const catalogBytes = Buffer.from(`${JSON.stringify(catalog)}\n`);
const provenanceBytes = Buffer.from(`${JSON.stringify(provenance)}\n`);
await writeFile(catalogPath, catalogBytes);
await writeFile(join(output, "icon-sources.json"), provenanceBytes);
manifest.catalog.bytes = catalogBytes.length;
manifest.catalog.sha256 = hash(catalogBytes);
manifest.counts.itemsWithIcons = catalog.items.length;
manifest.counts.uniqueIcons = new Set(catalog.items.map((item) => item.icon)).size;
manifest.iconSources = { path: "data/items/icon-sources.json", bytes: provenanceBytes.length, sha256: hash(provenanceBytes) };
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Verified ${planned.length} item icons: ${added} missing icons added, ${corrected} existing paths corrected, ${manifest.counts.uniqueIcons} unique PNGs.`);
