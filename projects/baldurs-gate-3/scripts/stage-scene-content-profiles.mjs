import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";
import { applySceneContentProfile, applySceneLocationPresentation, createSceneContentResolver,
  readVerifiedSceneContentCatalog, applySceneInventorySearch } from "./lib/scene-content-profile.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  if (!process.argv[index].startsWith("--") || process.argv[index + 1] === undefined) throw new Error("Expected --name value arguments");
  args.set(process.argv[index].slice(2), process.argv[index + 1]);
}
for (const key of ["baseline-maps", "catalog", "output-stage"]) if (!args.has(key)) throw new Error(`Missing --${key}`);
const baseline = fs.realpathSync(path.resolve(root, args.get("baseline-maps")));
const metadata = fs.realpathSync(path.resolve(root, args.get("metadata-maps") ?? "public/maps"));
const requested = path.resolve(root, args.get("output-stage"));
const output = path.join(fs.realpathSync(path.dirname(requested)), path.basename(requested));
const audits = fs.realpathSync(path.join(root, "map-sources/audits"));
const relativeOutput = path.relative(audits, output);
if (!relativeOutput || relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput) || fs.existsSync(output)) {
  throw new Error("Scene staging requires a new child directory of map-sources/audits");
}
const hashes = {}, pending = [], matches = [];
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readBytes = (file) => {
  const bytes = fs.readFileSync(file);
  const key = relative(file), digest = hash(bytes);
  if (hashes[key] && hashes[key] !== digest) throw new Error(`Scene input changed during staging: ${key}`);
  hashes[key] = digest;
  return bytes;
};
const catalogPath = path.resolve(root, args.get("catalog"));
const catalog = readVerifiedSceneContentCatalog(catalogPath, root);
readBytes(catalogPath);
for (const file of Object.keys(catalog.hashes)) readBytes(path.resolve(root, file));
for (const file of [import.meta.filename, path.join(import.meta.dirname, "lib/scene-content-profile.mjs"),
  path.join(import.meta.dirname, "lib/placement-presentation.mjs")]) readBytes(file);
const resolve = createSceneContentResolver(catalog);
const registryPath = path.join(root, "src/features/map/map-registry.ts");
const mapIds = readRegisteredMapIds(readBytes(registryPath).toString("utf8"));
let appearances = 0;
const identities = new Set();
for (const mapId of mapIds) {
  const contentBytes = readBytes(path.join(baseline, mapId, "content.json"));
  const content = JSON.parse(contentBytes.toString("utf8"));
  const locationBytes = readBytes(path.join(baseline, mapId, "locations.json"));
  const locations = JSON.parse(locationBytes.toString("utf8"));
  const metadataBytes = readBytes(path.join(metadata, mapId, "metadata.json"));
  const profilesById = new Map();
  const update = (entity) => {
    appearances++;
    identities.add(entity.id);
    const profile = resolve(entity.storyDestination);
    if (!profile) return entity;
    if (matches.some((entry) => entry.profileId === profile.id)) throw new Error(`Scene has more than one routed appearance: ${profile.id}`);
    if (locations.locations.filter(({ contentId }) => contentId === entity.id).length !== 1) throw new Error(`Scene has no unique marker: ${mapId}/${entity.id}`);
    profilesById.set(entity.id, profile);
    matches.push({ mapId, contentId: entity.id, profileId: profile.id });
    return applySceneContentProfile(entity, profile);
  };
  const entities = Array.isArray(content.entities) ? content.entities.map(update)
    : Object.fromEntries(Object.entries(content.entities).map(([key, entity]) => [key, update(entity)]));
  const sceneLocations = locations.locations.map((location) => {
    const profile = profilesById.get(location.contentId);
    return applySceneInventorySearch(applySceneLocationPresentation(location, profile), profile);
  });
  const serialized = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const files = { "content.json": contentBytes, "locations.json": locationBytes, "metadata.json": metadataBytes };
  for (const [name, bytes] of Object.entries(files)) {
    pending.push([`baseline/maps/${mapId}/${name}`, bytes]);
    const updated = profilesById.size && name === "content.json" ? serialized({ ...content, entities })
      : profilesById.size && name === "locations.json" ? serialized({ ...locations, locations: sceneLocations }) : bytes;
    pending.push([`public/maps/${mapId}/${name}`, updated]);
  }
}
if (matches.length !== catalog.profiles.length) throw new Error("Some reviewed scenes lack a routed appearance; nothing was written");
// Snapshot the live content boundary as well. This operation may only write the new stage.
for (const mapId of mapIds) for (const name of ["content.json", "locations.json", "metadata.json"]) readBytes(path.join(root, "public/maps", mapId, name));
readBytes(path.join(root, "public/data/item-database.json"));
for (const [file, expected] of Object.entries(hashes)) if (hash(fs.readFileSync(path.resolve(root, file))) !== expected) throw new Error(`Stale staging input: ${file}`);
for (const [file, bytes] of pending) {
  const target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  writeGeneratedFile(target, bytes);
}
for (const [file, expected] of Object.entries(hashes)) if (hash(fs.readFileSync(path.resolve(root, file))) !== expected) throw new Error(`Source changed while writing: ${file}`);
const manifest = { kind: "isolated-scene-content-stage", baseline, metadata, catalogPath, maps: mapIds, matches,
  stats: { maps: mapIds.length, appearances, identities: identities.size, reviewedAppearances: matches.length }, hashes,
  scope: "Scene presentation and conditional authored loot only; equipment and unreviewed later scenes remain open. No rasters copied or changed." };
writeGeneratedFile(path.join(output, "stage-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output, ...manifest.stats, matches }, null, 2));
