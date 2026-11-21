import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { finalizePlacementRouting } from "./lib/placement-routing.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const auditsRoot = fs.realpathSync(path.join(root, "map-sources/audits"));
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
};
if (process.argv.length !== 4) throw new Error("Usage: node scripts/finalize-staged-placement-maps.mjs <source-stage> <new-output-stage>");
const sourceRoot = fs.realpathSync(path.resolve(root, process.argv[2]));
const requestedOutput = path.resolve(root, process.argv[3]);
const outputRoot = path.join(fs.realpathSync(path.dirname(requestedOutput)), path.basename(requestedOutput));
if (!inside(auditsRoot, sourceRoot) || !inside(auditsRoot, outputRoot)
  || sourceRoot === outputRoot || inside(sourceRoot, outputRoot) || inside(outputRoot, sourceRoot)) {
  throw new Error("Source and output must be separate child directories under audits");
}
if (fs.existsSync(outputRoot)) throw new Error("Routing requires a new output directory; existing stages are preserved");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const inputHashes = {};
const readInput = (key, file) => {
  const bytes = fs.readFileSync(file);
  inputHashes[key] = hash(bytes);
  return JSON.parse(bytes.toString("utf8"));
};
const manifestPath = path.join(sourceRoot, "stage-manifest.json");
const manifest = readInput("manifest", manifestPath), config = readInput("config", manifest.configPath);
if (manifest.kind !== "unfinalized-placement-stage" || manifest.recordsIncluded !== false
  || !isDeepStrictEqual([...manifest.maps].sort(), config.maps.map(({ id }) => id).sort())) {
  throw new Error("Routing requires a completed, full, compact raw stage");
}
const childFirst = manifest.storyDestinationRouting === "superseding-map-first";
const auditPath = path.join(sourceRoot, childFirst ? "parent-story-routing-audit.json" : "narrated-object-source-audit.json");
const sourceAudit = readInput("sourceAudit", auditPath);
const auditedMaps = childFirst ? sourceAudit.stats.stagedMaps : sourceAudit.stats.maps;
if (!Array.isArray(sourceAudit.errors) || sourceAudit.errors.length || auditedMaps !== manifest.maps.length
  || (childFirst && (sourceAudit.kind !== "child-first-placement-source-audit" || sourceAudit.stats.combinedMaps !== manifest.maps.length))
  || sourceAudit.stageRoot !== sourceRoot) {
  throw new Error("Complete source/conservation audit must pass before routing this stage");
}
const auditDependencies = new Map();
if (childFirst) {
  for (const [relative, expected] of Object.entries(sourceAudit.hashes)) {
    const filename = path.resolve(root, relative);
    if (!inside(root, filename)) throw new Error(`Audit dependency outside the project: ${relative}`);
    if (hash(fs.readFileSync(filename)) !== expected) throw new Error(`Stale composed source audit: ${relative}`);
    auditDependencies.set(filename, expected);
  }
}
const auditedSourceHash = (relative, legacyKey) => sourceAudit.hashes[childFirst
  ? path.relative(root, path.join(sourceRoot, relative)).split(path.sep).join("/") : legacyKey];
const documents = new Map(), sourceHashes = {}, copiedFiles = new Map();
const readSourceBytes = (relative) => {
  const bytes = fs.readFileSync(path.join(sourceRoot, relative));
  sourceHashes[relative] = hash(bytes);
  return bytes;
};
const readSource = (relative) => JSON.parse(readSourceBytes(relative).toString("utf8"));
for (const mapId of manifest.maps) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(mapId)) throw new Error(`Unsafe map ID: ${mapId}`);
  const contentPath = `public/maps/${mapId}/content.json`;
  const content = readSource(contentPath);
  if (sourceHashes[contentPath] !== auditedSourceHash(contentPath, `${mapId}:after`)) throw new Error(`Stale source audit: ${mapId}`);
  const locations = readSource(`public/maps/${mapId}/locations.json`);
  if (childFirst && sourceHashes[`public/maps/${mapId}/locations.json`] !== auditedSourceHash(`public/maps/${mapId}/locations.json`)) {
    throw new Error(`Stale location conservation audit: ${mapId}`);
  }
  const placementPath = `map-sources/catalog/${mapId}-placements.json`;
  const placement = readSource(placementPath);
  if (sourceHashes[placementPath] !== auditedSourceHash(placementPath, `${mapId}:placement`)) throw new Error(`Stale native candidate audit: ${mapId}`);
  if (placement.recordsOmitted !== true || Object.hasOwn(placement, "records")) throw new Error(`Expected a compact candidate catalog: ${mapId}`);
  const rejectionPath = `map-sources/catalog/${mapId}-placement-rejections.json`;
  const rejectionBytes = readSourceBytes(rejectionPath);
  JSON.parse(rejectionBytes.toString("utf8"));
  copiedFiles.set(rejectionPath, rejectionBytes);
  documents.set(mapId, { content, locations, placement });
}
const routing = finalizePlacementRouting(config.maps, documents);
fs.mkdirSync(outputRoot);
const outputHashes = {};
const write = (relative, value) => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const filename = path.join(outputRoot, relative);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  writeGeneratedFile(filename, bytes);
  outputHashes[relative] = hash(bytes);
};
for (const [mapId, { content, locations, placement }] of documents) {
  write(`public/maps/${mapId}/content.json`, content);
  write(`public/maps/${mapId}/locations.json`, locations);
  write(`map-sources/catalog/${mapId}-placements.json`, placement);
}
for (const [relative, bytes] of copiedFiles) write(relative, bytes);
for (const [relative, expected] of Object.entries(sourceHashes)) {
  if (hash(fs.readFileSync(path.join(sourceRoot, relative))) !== expected) throw new Error(`Source stage changed during routing: ${relative}`);
}
for (const [key, filename] of [["manifest", manifestPath], ["config", manifest.configPath], ["sourceAudit", auditPath]]) {
  if (hash(fs.readFileSync(filename)) !== inputHashes[key]) throw new Error(`Routing input changed: ${filename}`);
}
for (const [filename, expected] of auditDependencies) {
  if (hash(fs.readFileSync(filename)) !== expected) throw new Error(`Composed source audit input changed: ${filename}`);
}
write("routing-report.json", { scope: "Isolated parent/child routing and unavailable-link cleanup, not live publication or proof of complete source coverage.",
  sourceRoot, inputHashes, sourceHashes, outputHashes: { ...outputHashes }, ...routing });
write("stage-manifest.json", { ...manifest, kind: "routed-placement-stage", sourceStageRoot: sourceRoot,
  publishedDataUnchanged: true, requiresRoutingAndConservationReview: true, sourceAuditPath: auditPath,
  inputHashes, routingReport: "routing-report.json" });
console.log(JSON.stringify({ outputRoot, stats: routing.stats, publishedDataUnchanged: true }, null, 2));
