import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readStoryFacts, parseEndpoint } from "./lib/story-goal-facts.mjs";
import { createStoryRuleLookup } from "./lib/story-rule-context.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const stageRoot = path.resolve(root, process.argv[2] ?? "map-sources/audits/staged-narrated-objects");
const baselineRoot = path.join(root, "map-sources/audits/staged-full-content-audit");
const snapshots = new Map();
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readText = (file) => {
  const bytes = fs.readFileSync(file);
  const currentHash = digest(bytes), previousHash = snapshots.get(file);
  if (previousHash && previousHash !== currentHash) throw new Error(`Audit input changed while being read: ${file}`);
  snapshots.set(file, currentHash);
  return bytes.toString("utf8");
};
const read = (file) => JSON.parse(readText(file));
const hash = (file) => {
  if (!snapshots.has(file)) readText(file);
  return snapshots.get(file);
};
const manifest = read(path.join(stageRoot, "stage-manifest.json"));
const catalogPath = path.join(root, "map-sources/catalog/story-interactions.json");
const registrations = read(catalogPath).entries.filter((entry) => entry.triggerPredicates.includes("DB_ItemDialog_NarratorAD"));
const nativeFacts = readStoryFacts([path.join(root, "map-sources/extracted/story-goals")], root)
  .filter((fact) => fact.predicate === "DB_ItemDialog_NarratorAD");
const bySite = new Map(nativeFacts.map((fact) => [`${fact.evidence.sourcePath}:${fact.evidence.sourceLine}`, fact]));
const rules = new Map(), hashes = { catalog: hash(catalogPath) }, errors = [], additions = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const validByObject = new Map();
for (const entry of registrations) {
  const valid = entry.evidence.map((evidence) => bySite.get(`${evidence.sourcePath}:${evidence.sourceLine}`)).filter((fact) => {
    if (!fact || fact.negated || parseEndpoint(fact.arguments[0])?.id !== entry.objectId) return false;
    const file = path.join(root, fact.evidence.sourcePath);
    if (!rules.has(file)) {
      rules.set(file, createStoryRuleLookup(readText(file)));
      hashes[fact.evidence.sourcePath] = hash(file);
    }
    const rule = rules.get(file)(fact.evidence.sourceLine);
    return fact.section === "init" || fact.section === "kb" && rule?.actionLine
      && fact.evidence.sourceLine >= rule.actionLine && !rule.debugOnly;
  });
  check(valid.length > 0, `Narrated object lacks positive normal registration: ${entry.objectId}`);
  validByObject.set(entry.objectId, valid);
}
const placementRoots = ["map-sources/extracted/package-placements", "map-sources/converted/main-level-placements", "map-sources/converted/wld-placements", "map-sources/converted/auxiliary-level-placements"];
const nativeObjects = new Map();
const templateCatalogPath = path.join(root, "map-sources/catalog/root-templates.json");
const templateCatalog = read(templateCatalogPath).templates;
hashes.rootTemplateCatalog = hash(templateCatalogPath);
const transformCatalogPath = path.join(root, "map-sources/catalog/level-transforms.json");
const transformCatalog = read(transformCatalogPath);
const transforms = new Map([...transformCatalog.transforms, ...(transformCatalog.spatialTransforms ?? [])].map((entry) => [entry.id, entry]));
hashes.levelTransforms = hash(transformCatalogPath);
const loadObjects = (file) => {
  if (!nativeObjects.has(file)) {
    nativeObjects.set(file, new Map((read(file).save?.regions?.Templates?.GameObjects ?? []).map((object) => [object.MapKey?.value, object])));
    hashes[path.relative(root, file).split(path.sep).join("/")] = hash(file);
  }
  return nativeObjects.get(file);
};
const nativeStats = (object) => {
  if (Object.hasOwn(object, "Stats")) return object.Stats?.value ?? "";
  let templateId = object.TemplateName?.value;
  const visited = new Set();
  while (templateId && !visited.has(templateId)) {
    visited.add(templateId);
    const source = templateCatalog[templateId]?.provenance;
    if (!source) return undefined;
    const template = loadObjects(path.join(root, "map-sources/extracted/root-templates", source)).get(templateId);
    if (!template) return undefined;
    if (Object.hasOwn(template, "Stats")) return template.Stats?.value ?? "";
    templateId = template.ParentTemplateId?.value;
  }
  return undefined;
};
const sameNativeVector = (left, right) => ["x", "y", "z"].every((axis) =>
  Number.isFinite(left?.[axis]) && Number.isFinite(right?.[axis]) && Math.fround(left[axis]) === Math.fround(right[axis]));
const sameMappedPosition = (expected, actual, record) => {
  if (!record.templateProjection && !record.positionTransform) return sameNativeVector(expected, actual);
  // Matrix multiplication and the generator's vector expression have different
  // operation orders. This permits only arithmetic noise, not map displacement.
  return ["x", "y", "z"].every((axis) => Number.isFinite(expected?.[axis])
    && Number.isFinite(actual?.[axis]) && Math.abs(expected[axis] - actual[axis]) <= 1e-9);
};
const mappedPosition = (object, record) => {
  const values = object.Transform?.[0]?.Position?.value?.split(/\s+/).map(Number);
  if (!values) return undefined;
  let position = { x: values[0], y: values[1], z: values[2] };
  if (record.sourcePosition && !sameNativeVector(record.sourcePosition, position)) return undefined;
  for (const instance of record.templateProjection?.chain ?? []) {
    const filename = ["map-sources/extracted/level-templates", ...placementRoots]
      .map((directory) => path.join(root, directory, instance.provenance.sourcePath)).find((file) => fs.existsSync(file));
    if (!filename) return undefined;
    const native = loadObjects(filename).get(instance.id.split("#")[1]);
    const translation = native?.Transform?.[0]?.Position?.value?.split(/\s+/).map(Number);
    const rotation = native?.Transform?.[0]?.RotationQuat?.value?.split(/\s+/).map(Number);
    const scale = native?.Transform?.[0]?.Scale?.value;
    if (!translation?.every(Number.isFinite) || !rotation?.every(Number.isFinite) || rotation.length !== 4
      || !Number.isFinite(scale) || scale <= 0 || Math.abs(Math.hypot(...rotation) - 1) > 1e-5
      || !isDeepStrictEqual(instance.rotation, { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] }) || instance.scale !== scale
      || !isDeepStrictEqual(instance.position, { x: translation[0], y: translation[1], z: translation[2] })) return undefined;
    // Independently form the native quaternion rotation matrix; do not call
    // the producer's transform helper or round authored rotations to quarters.
    // Keep the quaternion's native norm, including fvec4 serialization error.
    const [x, y, z, w] = rotation;
    const matrix = [
      [w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y)],
      [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)],
      [2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z],
    ];
    const vector = [position.x * scale, position.y * scale, position.z * scale];
    const rotated = matrix.map((row, axis) => row.reduce((sum, value, index) => sum + value * vector[index], 0) + translation[axis]);
    position = { x: rotated[0], y: rotated[1], z: rotated[2] };
  }
  const applied = record.templateProjection?.mapTransform ?? record.positionTransform;
  if (applied) {
    const transform = transforms.get(applied.id);
    if (!transform || !isDeepStrictEqual(transform.offset, applied.offset)
      || (transform.rotationQuarterTurns ?? 0) !== (applied.rotationQuarterTurns ?? 0)) return undefined;
    const rotation = ((transform.rotationQuarterTurns ?? 0) % 4 + 4) % 4;
    const [x, z] = [[position.x, position.z], [-position.z, position.x], [-position.x, -position.z], [position.z, -position.x]][rotation];
    position = { x: x + transform.offset.x, y: position.y, z: z + transform.offset.z };
  }
  return position;
};
for (const mapId of manifest.maps) {
  const basePath = path.join(baselineRoot, "public/maps", mapId, "content.json");
  const currentPath = path.join(stageRoot, "public/maps", mapId, "content.json");
  const before = read(basePath), after = read(currentPath);
  const placementPath = path.join(stageRoot, "map-sources/catalog", `${mapId}-placements.json`);
  const placement = read(placementPath);
  const records = new Map((placement.recordsOmitted ? placement.candidates : placement.records).map((record) => [record.id, record]));
  hashes[`${mapId}:before`] = hash(basePath);
  hashes[`${mapId}:after`] = hash(currentPath);
  hashes[`${mapId}:placement`] = hash(placementPath);
  const old = new Map(before.entities.map((entity) => [entity.id, entity])), next = new Map(after.entities.map((entity) => [entity.id, entity]));
  for (const [id, entity] of old) check(isDeepStrictEqual(entity, next.get(id)), `Existing entity removed/changed: ${mapId}/${id}`);
  for (const [id, entity] of next) {
    if (old.has(id)) continue;
    check(entity.kind === "interactable" && validByObject.get(id)?.length, `Unexpected new marker: ${mapId}/${id}`);
    const native = (entity.provenance ?? []).flatMap(({ sourcePath }) => placementRoots.map((directory) => path.join(root, directory, sourcePath.replace(/^supplementary\//, ""))))
      .filter((file) => fs.existsSync(file)).map((file) => ({ file, object: loadObjects(file).get(id) })).filter(({ object }) => object);
    const matching = native.find(({ object }) => {
      const record = records.get(id);
      const position = record ? mappedPosition(object, record) : undefined;
      return position && sameMappedPosition(position, entity.worldPosition, record)
        && object.TemplateName?.value === entity.templateId && nativeStats(object) === entity.statsId;
    });
    check(Boolean(matching), `Native position/template/Stats not proven: ${mapId}/${id}`);
    additions.push({ mapId, id, title: entity.title, kind: entity.kind, worldPosition: entity.worldPosition,
      sourcePath: matching ? path.relative(root, matching.file).split(path.sep).join("/") : null,
      positionTransform: records.get(id)?.positionTransform ?? records.get(id)?.templateProjection,
      registrations: validByObject.get(id)?.map((fact) => fact.evidence) });
  }
}
for (const [file, expected] of snapshots) {
  check(digest(fs.readFileSync(file)) === expected, `Audit input changed before completion: ${file}`);
}
const report = { scope: "All narrator registrations checked against positive normal native rules; complete staged entity conservation and native placement/template/Stats plus indexed map-transform consistency for additions. Native quaternion/scale/translation instances are independently evaluated as matrices with 1e-9 arithmetic tolerance; untransformed fvec3 values must be identical at native float32 precision. This does not independently rederive the map-transform catalog; raster visibility, routing, and other maps remain separate audits.",
  stageRoot, baselineRoot,
  stats: { registeredObjects: registrations.length, maps: manifest.maps.length, addedAppearances: additions.length, addedUniqueObjects: new Set(additions.map(({ id }) => id)).size },
  hashes, additions, errors };
writeGeneratedFile(path.join(stageRoot, "narrated-object-source-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ stats: report.stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
