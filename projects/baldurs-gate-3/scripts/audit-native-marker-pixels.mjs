import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 5, "Usage: audit-native-marker-pixels.mjs <canonical-stage> <raster-review> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [stage, reviewPath, output] = process.argv.slice(2).map((value) => path.resolve(root, value));
assert(!fs.existsSync(output), "Use a fresh report path");
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
const manifestPath = path.join(stage, "stage-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const successor = path.resolve(root, review.stage) !== stage;
if (successor) {
  assert.equal(manifest.kind, "canonical-native-raster-anchor-stage");
  assert.equal(path.resolve(root, manifest.baselineStage), path.resolve(root, review.stage));
  assert.equal(path.resolve(root, manifest.rasterOverridesRoot), path.resolve(root, review.rasterRoot));
}
assert(review.results.every((map) => map.levels.every((level) => level.changedAlpha === 0)), "Resolve native raster fidelity before reviewing pin anchors");
const hashes = { [relative(reviewPath)]: digest(fs.readFileSync(reviewPath)),
  [relative(manifestPath)]: digest(fs.readFileSync(manifestPath)) };
const read = (file, requireReview = true) => {
  const bytes = fs.readFileSync(file), key = relative(file), hash = digest(bytes);
  const stageRelative = path.relative(stage, file).replaceAll("\\", "/");
  if (requireReview) assert.equal(hash, manifest.outputHashes?.[stageRelative] ?? manifest.hashes?.[key] ?? review.hashes[key],
    `Input not covered by the bound stage/raster review: ${key}`);
  hashes[key] = hash;
  return bytes;
};
const config = JSON.parse(read(path.join(root, "map-sources/config/placement-maps.json")));
assert.deepEqual([...manifest.maps].sort(), config.maps.map((map) => map.id).sort());
const overridden = new Set(review.results.map((map) => map.mapId));
const results = [], findings = [];
sharp.cache(false);
for (const mapId of manifest.maps) {
  const rasterRoot = path.join(overridden.has(mapId) ? path.resolve(root, review.rasterRoot) : path.join(root, "public/maps"), mapId);
  const meta = JSON.parse(read(path.join(rasterRoot, "metadata.json")));
  const locationPath = path.join(stage, `public/maps/${mapId}/locations.json`);
  const locationBytes = read(locationPath);
  assert.equal(digest(locationBytes), manifest.outputHashes[`public/maps/${mapId}/locations.json`]);
  const locations = JSON.parse(locationBytes).locations;
  const width = meta.tileImageSize?.width ?? meta.bounds.maxX - meta.bounds.minX;
  const height = meta.tileImageSize?.height ?? meta.bounds.maxY - meta.bounds.minY;
  assert(Number.isInteger(width) && Number.isInteger(height));
  const overview = await sharp(read(path.join(rasterRoot, "overview.webp"))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cache = new Map();
  const alphaAt = async (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    const column = Math.floor(x / meta.tileSize), row = Math.floor(y / meta.tileSize);
    const key = `${column}x${row}`;
    if (!cache.has(key)) {
      const decoded = await sharp(read(path.join(rasterRoot, `tiles/0/tile${key}.webp`))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert(decoded.info.width === meta.tileSize && decoded.info.height === meta.tileSize && decoded.info.channels === 4);
      cache.set(key, decoded.data);
    }
    return cache.get(key)[((y % meta.tileSize) * meta.tileSize + x % meta.tileSize) * 4 + 3];
  };
  const sampleOverview = (x, y) => x < 0 || y < 0 || x >= overview.info.width || y >= overview.info.height ? 0
    : overview.data[(y * overview.info.width + x) * 4 + 3];
  let nativeTransparent = 0, oldOverviewTransparent = 0, geometricOverviewTransparent = 0;
  for (const location of locations) {
    const u = (location.x - meta.bounds.minX) / (meta.bounds.maxX - meta.bounds.minX);
    const v = (location.y - meta.bounds.minY) / (meta.bounds.maxY - meta.bounds.minY);
    assert(Number.isFinite(u) && Number.isFinite(v));
    // Runtime spans image edges, not the distance between first/last pixel centers.
    const x = Math.floor(u * width), y = Math.floor(v * height);
    const alpha = await alphaAt(x, y);
    const oldAlpha = sampleOverview(Math.round(u * (overview.info.width - 1)), Math.round(v * (overview.info.height - 1)));
    const overviewAlpha = sampleOverview(Math.floor(u * overview.info.width), Math.floor(v * overview.info.height));
    if (oldAlpha <= 16) oldOverviewTransparent++;
    if (overviewAlpha <= 16) geometricOverviewTransparent++;
    if (alpha > 16) continue;
    nativeTransparent++;
    let nearest = null;
    // Diagnostic only: no pin movement or source-coordinate replacement.
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const px = x + dx, py = y + dy, distance = Math.hypot(px + 0.5 - u * width, py + 0.5 - v * height);
      if (nearest && nearest.distance <= distance) continue;
      const candidateAlpha = await alphaAt(px, py);
      if (candidateAlpha > 16) nearest = { x: px, y: py, alpha: candidateAlpha, distance,
        mapPosition: { x: meta.bounds.minX + (px + 0.5) / width * (meta.bounds.maxX - meta.bounds.minX),
          y: meta.bounds.minY + (py + 0.5) / height * (meta.bounds.maxY - meta.bounds.minY) } };
    }
    findings.push({ mapId, id: location.id, name: location.name, alpha, oldOverviewAlpha: oldAlpha,
      geometricOverviewAlpha: overviewAlpha, mapPosition: { x: location.x, y: location.y },
      nativePosition: { x: u * width, y: v * height }, inBounds: u >= 0 && u < 1 && v >= 0 && v < 1,
      rasterChanged: overridden.has(mapId), nearestWithinEightPixels: nearest });
  }
  results.push({ mapId, locations: locations.length, nativeTransparent, oldOverviewTransparent, geometricOverviewTransparent,
    sampledTiles: cache.size, rasterChanged: overridden.has(mapId) });
}
read(import.meta.filename, false);
read(path.join(root, "src/features/map/map-tile-utils.ts"));
read(path.join(root, "scripts/build-placement-catalog.mjs"));
read(path.join(root, "scripts/audit-map-marker-placement.mjs"));
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.join(root, file))), hash, `Input changed during review: ${file}`);
const sum = (field) => results.reduce((total, row) => total + row[field], 0);
const remainingRasterErrors = review.errors.filter((error) => !(successor && error.kind === "new-transparent-pin"
  && manifest.changes.some((change) => change.mapId === error.mapId && change.id === error.id)));
const pixelCheckPassed = findings.length === 0 && remainingRasterErrors.length === 0;
const report = { kind: "native-resolution-marker-pixel-review", stage: relative(stage), rasterReview: relative(reviewPath),
  stats: { maps: results.length, locations: sum("locations"), nativeTransparent: sum("nativeTransparent"),
    oldOverviewTransparent: sum("oldOverviewTransparent"), geometricOverviewTransparent: sum("geometricOverviewTransparent"),
    hiddenByOldOverviewCheck: findings.filter((row) => row.oldOverviewAlpha > 16).length,
    withinEightPixels: findings.filter((row) => row.nearestWithinEightPixels).length },
  results, findings, remainingRasterErrors, hashes, pixelCheckPassed, publicationReady: false,
  limitations: ["Read-only sampled native tile pixels at every canonical display pin, with both overview coordinate conventions.",
    "A transparent pivot does not establish a missing map, wrong object, or deletion permission. Nearby pixels are diagnostic candidates, not approved anchors.",
    "A passing pixel check is not publication approval; scene semantics, saved-state migration and full coverage require separate gates.",
    "No application tests, pin edits, world-coordinate changes, raster publication or claim of complete scene/map coverage."] };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report.stats, hashes: Object.keys(hashes).length, pixelCheckPassed, publicationReady: false, output: relative(output) }));
if (!pixelCheckPassed) process.exitCode = 1;
