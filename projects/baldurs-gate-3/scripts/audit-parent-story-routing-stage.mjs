import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createStoryRuleLookup } from "./lib/story-rule-context.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const baseRoot = path.join(root, "map-sources/audits/staged-narrated-priority-full");
const stageRoot = path.resolve(root, process.argv[2] ?? "map-sources/audits/staged-parent-story-routing");
const hashes = {}, errors = [], changes = [], nativeObjects = new Map();
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readText = (filename) => {
  const bytes = fs.readFileSync(filename), key = path.relative(root, filename).split(path.sep).join("/");
  if (hashes[key] && hashes[key] !== hash(bytes)) throw new Error(`Input changed: ${filename}`);
  hashes[key] = hash(bytes);
  return bytes.toString("utf8");
};
const read = (filename) => JSON.parse(readText(filename));
const check = (condition, message) => { if (!condition) errors.push(message); };
const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const manifest = read(path.join(stageRoot, "stage-manifest.json"));
const baselineManifest = read(path.join(baseRoot, "stage-manifest.json"));
const baselineAudit = read(path.join(baseRoot, "narrated-object-source-audit.json"));
const config = read(manifest.configPath), definitions = new Map(config.maps.map((map) => [map.id, map]));
const transformCatalog = read(path.join(root, config.levelTransforms));
const transforms = new Map([...transformCatalog.transforms, ...(transformCatalog.spatialTransforms ?? [])].map((entry) => [entry.id, entry]));
check(manifest.storyDestinationRouting === "superseding-map-first", "Stage lacks child-first destination selection");
check(Array.isArray(baselineAudit.errors) && baselineAudit.errors.length === 0
  && baselineAudit.stats.maps === config.maps.length && baselineAudit.stageRoot === baseRoot,
"A complete native/conservation audit of the baseline is required");
check(manifest.configPath === baselineManifest.configPath && manifest.dialogCatalogPath === baselineManifest.dialogCatalogPath
  && manifest.storyLocationsPath === baselineManifest.storyLocationsPath, "Stage changed unrelated catalog/config inputs");
// Revalidate the native baseline's inputs, not just its passing status. The
// successor intentionally removes covered parent copies and therefore composes
// with, rather than impersonates, that earlier preservation audit.
const baselineAliases = {
  catalog: path.join(root, "map-sources/catalog/story-interactions.json"),
  rootTemplateCatalog: path.join(root, "map-sources/catalog/root-templates.json"),
  levelTransforms: path.join(root, config.levelTransforms),
};
for (const [key, expected] of Object.entries(baselineAudit.hashes)) {
  const mapSnapshot = key.match(/^([a-z0-9-]+):(before|after|placement)$/);
  const filename = baselineAliases[key] ?? (mapSnapshot
    ? mapSnapshot[2] === "placement"
      ? path.join(baseRoot, "map-sources/catalog", `${mapSnapshot[1]}-placements.json`)
      : path.join(mapSnapshot[2] === "before" ? baselineAudit.baselineRoot : baseRoot,
        "public/maps", mapSnapshot[1], "content.json")
    : key.includes("/") ? path.join(root, key) : null);
  if (!filename) throw new Error(`Unknown baseline snapshot key: ${key}`);
  readText(filename);
  const relative = path.relative(root, filename).split(path.sep).join("/");
  check(hashes[relative] === expected, `Native baseline input changed: ${key}`);
}
const baseline = new Map(config.maps.map(({ id }) => [id, read(path.join(baseRoot, "public/maps", id, "content.json"))]));
for (const { id } of config.maps) {
  const relative = path.relative(root, path.join(baseRoot, "public/maps", id, "content.json")).split(path.sep).join("/");
  check(hashes[relative] === baselineAudit.hashes[`${id}:after`], `Native baseline audit is stale: ${id}`);
}
const combined = new Map(baseline);
for (const id of manifest.maps) combined.set(id, read(path.join(stageRoot, "public/maps", id, "content.json")));
const descendants = (id, trail = new Set()) => {
  if (trail.has(id)) throw new Error(`Cyclic hierarchy: ${id}`);
  return new Set((definitions.get(id).supersededBy ?? []).flatMap((child) => [child, ...descendants(child, new Set([...trail, id]))]));
};
const anchors = (profile) => [profile.anchorContentId, ...(profile.otherAnchorContentIds ?? [])];
const nativeAnchor = (entity, candidate) => {
  if (!candidate || candidate.templateProjection || !isDeepStrictEqual(candidate.position, entity.worldPosition)) return undefined;
  const id = entity.storyDestination.anchorContentId;
  for (const { sourcePath } of entity.provenance ?? []) {
    for (const directory of ["map-sources/extracted/package-placements", "map-sources/converted/main-level-placements", "map-sources/converted/wld-placements", "map-sources/converted/auxiliary-level-placements"]) {
      const file = path.join(root, directory, sourcePath.replace(/^supplementary\//, ""));
      if (!fs.existsSync(file) || !file.endsWith(".lsj")) continue;
      if (!nativeObjects.has(file)) nativeObjects.set(file, new Map((read(file).save?.regions?.Templates?.GameObjects ?? []).map((object) => [object.MapKey?.value, object])));
      const object = nativeObjects.get(file).get(id);
      if (!object) continue;
      const vector = object.Transform?.[0]?.Position?.value?.split(/\s+/).map(Number);
      if (!vector || vector.length !== 3) continue;
      if (candidate.sourcePosition && !["x", "y", "z"].every((axis, index) => Math.fround(candidate.sourcePosition[axis]) === Math.fround(vector[index]))) continue;
      let expected = { x: vector[0], y: vector[1], z: vector[2] };
      const applied = candidate.positionTransform;
      if (applied) {
        const transform = transforms.get(applied.id);
        if (!transform || !isDeepStrictEqual(transform.offset, applied.offset)
          || (transform.rotationQuarterTurns ?? 0) !== applied.rotationQuarterTurns) continue;
        const quarter = ((applied.rotationQuarterTurns % 4) + 4) % 4;
        const [x, z] = [[expected.x, expected.z], [-expected.z, expected.x], [-expected.x, -expected.z], [expected.z, -expected.x]][quarter];
        expected = { x: x + transform.offset.x, y: expected.y, z: z + transform.offset.z };
      }
      if (!["x", "y", "z"].every((axis) => Number.isFinite(entity.worldPosition[axis]) && (applied
        ? Math.abs(entity.worldPosition[axis] - expected[axis]) <= 1e-9
        : Math.fround(entity.worldPosition[axis]) === Math.fround(expected[axis])))) continue;
      return { sourcePath: path.relative(root, file).split(path.sep).join("/"), object, positionTransform: applied };
    }
  }
  return undefined;
};
for (const mapId of manifest.maps) {
  const before = baseline.get(mapId), after = combined.get(mapId);
  const candidates = new Map(read(path.join(stageRoot, "map-sources/catalog", `${mapId}-placements.json`)).candidates.map((candidate) => [candidate.id, candidate]));
  const next = new Map(after.entities.map((entity) => [entity.id, entity]));
  const expectedIds = new Set(), removedIds = new Set();
  const covered = new Set([...descendants(mapId)].flatMap((child) => combined.get(child).entities
    .filter((entity) => entity.storyDestination).flatMap(({ storyDestination: p }) => anchors(p).map((anchor) => `${p.characterContentId}/${anchor}`))));
  check(isDeepStrictEqual(omit(before, ["entities"]), omit(after, ["entities"])), `Non-entity content changed: ${mapId}`);
  for (const original of before.entities) {
    const profile = original.storyDestination;
    if (!profile) {
      check(isDeepStrictEqual(original, next.get(original.id)), `Unrelated entity changed: ${mapId}/${original.id}`);
      expectedIds.add(original.id);
      continue;
    }
    const remaining = anchors(profile).filter((anchor) => !covered.has(`${profile.characterContentId}/${anchor}`));
    const current = after.entities.filter(({ storyDestination: p }) => p?.characterContentId === profile.characterContentId);
    if (!remaining.length) {
      check(current.length === 0, `Parent kept an entirely child-covered arrival: ${mapId}/${original.id}`);
      removedIds.add(original.id);
      changes.push({ mapId, beforeId: original.id, kind: "covered-on-child" });
      continue;
    }
    check(current.length === 1, `Expected one remaining parent arrival: ${mapId}/${original.id}`);
    if (current.length !== 1) continue;
    const entity = current[0], selected = entity.storyDestination.anchorContentId;
    expectedIds.add(entity.id);
    check(remaining.includes(selected) && isDeepStrictEqual([...new Set(anchors(entity.storyDestination))].sort(), [...new Set(remaining)].sort()), `Parent lost or invented remaining destinations: ${mapId}/${original.id}`);
    check(isDeepStrictEqual(omit(original, ["id", "worldPosition", "provenance", "storyDestination"]), omit(entity, ["id", "worldPosition", "provenance", "storyDestination"])), `Unrelated actor content changed: ${mapId}/${original.id}`);
    if (remaining.includes(profile.anchorContentId)) {
      check(selected === profile.anchorContentId && entity.id === original.id
        && isDeepStrictEqual(entity.worldPosition, original.worldPosition) && isDeepStrictEqual(entity.provenance, original.provenance), `Uncovered existing anchor/identity changed: ${mapId}/${original.id}`);
    } else {
      removedIds.add(original.id);
      check(entity.id === `${profile.characterContentId}:destination:${selected}`, `New arrival has an unstable identity: ${mapId}/${entity.id}`);
      const native = nativeAnchor(entity, candidates.get(entity.id));
      check(Boolean(native), `New arrival needs independent native anchor/transform proof: ${mapId}/${entity.id}`);
      check(native?.object.Name?.value === entity.storyDestination.anchorName
        && native?.object.LevelName?.value === entity.sourceLevel, `Native arrival anchor name/level differs: ${mapId}/${entity.id}`);
      for (const evidence of entity.storyDestination.evidence) {
        const text = readText(path.join(root, evidence.sourcePath));
        const line = text.split(/\r?\n/)[evidence.sourceLine - 1]?.trim();
        const rule = createStoryRuleLookup(text)(evidence.sourceLine);
        check(line === `${evidence.statement};` && line.startsWith("TeleportTo(")
          && line.includes(profile.characterContentId) && line.includes(selected)
          && rule?.actionLine && evidence.sourceLine >= rule.actionLine && !rule.debugOnly,
        `New arrival lacks exact normal direct-teleport proof: ${mapId}/${entity.id}`);
      }
      changes.push({ mapId, beforeId: original.id, afterId: entity.id, kind: "uncovered-parent-arrival",
        worldPosition: entity.worldPosition, nativeAnchorSource: native?.sourcePath,
        positionTransform: native?.positionTransform, evidence: entity.storyDestination.evidence });
    }
    const expectedEvidence = new Set([
      ...profile.evidence.map((evidence) => JSON.stringify([profile.anchorContentId, evidence])),
      ...profile.alternateDestinations.flatMap((destination) => destination.evidence.map((evidence) => JSON.stringify([destination.anchorContentId, evidence]))),
    ].filter((entry) => remaining.includes(JSON.parse(entry)[0])));
    const actual = entity.storyDestination;
    const actualEvidence = new Set([
      ...actual.evidence.map((evidence) => JSON.stringify([actual.anchorContentId, evidence])),
      ...actual.alternateDestinations.flatMap((destination) => destination.evidence.map((evidence) => JSON.stringify([destination.anchorContentId, evidence]))),
    ]);
    check(isDeepStrictEqual([...expectedEvidence].sort(), [...actualEvidence].sort()), `Parent destination evidence changed: ${mapId}/${entity.id}`);
  }
  check(isDeepStrictEqual([...expectedIds].sort(), [...next.keys()].sort()), `Unexpected parent entity identities: ${mapId}`);
  const locationsBefore = read(path.join(baseRoot, "public/maps", mapId, "locations.json"));
  const locationsAfter = read(path.join(stageRoot, "public/maps", mapId, "locations.json"));
  const nextLocations = new Map(locationsAfter.locations.map((location) => [location.id, location]));
  for (const location of locationsBefore.locations) if (!removedIds.has(location.contentId)) {
    check(isDeepStrictEqual(location, nextLocations.get(location.id)), `Unrelated location changed: ${mapId}/${location.id}`);
  }
  for (const location of locationsAfter.locations) check(expectedIds.has(location.contentId), `Unexpected location target: ${mapId}/${location.id}`);
}
// Independent prospective hierarchy routing: every prior identity and every
// selected/alternate source destination must survive the eventual deduplication.
const routed = new Map([...combined].map(([mapId, content]) => [mapId, content.entities.filter((entity) =>
  ![...descendants(mapId)].some((child) => combined.get(child).entities.some(({ id }) => id === entity.id)))]));
const retainedIds = new Set([...routed.values()].flatMap((entities) => entities.map(({ id }) => id)));
for (const content of baseline.values()) for (const { id } of content.entities) check(retainedIds.has(id), `Prospective routing loses existing identity: ${id}`);
const retainedAnchors = new Set([...routed.values()].flatMap((entities) => entities.filter((e) => e.storyDestination)
  .flatMap(({ storyDestination: p }) => anchors(p).map((anchor) => `${p.characterContentId}/${anchor}`))));
for (const content of baseline.values()) for (const { storyDestination: profile } of content.entities) {
  if (!profile) continue;
  for (const anchor of anchors(profile)) check(retainedAnchors.has(`${profile.characterContentId}/${anchor}`), `Prospective routing loses a story destination: ${profile.characterContentId}/${anchor}`);
}
for (const [relative, expected] of Object.entries(hashes)) check(hash(fs.readFileSync(path.join(root, relative))) === expected, `Audit input changed: ${relative}`);
const report = { kind: "child-first-placement-source-audit",
  scope: "Child-first source selection compared with the prior complete raw stage, with all recorded native baseline inputs revalidated; unchanged entity/location conservation, exact native direct-teleport and anchor-coordinate proof plus indexed map-transform consistency for newly selected parent arrivals, and independent prospective all-map identity/destination retention. This does not independently rederive map calibration. Nested native instances or non-direct procedures need separate proof. Not publication, complete scene-state validation, or raster proof.",
  baseRoot, stageRoot, stats: { stagedMaps: manifest.maps.length, combinedMaps: combined.size, prospectiveRoutedAppearances: [...routed.values()].reduce((n, entries) => n + entries.length, 0),
    prospectiveRoutedIdentities: retainedIds.size, coveredParentCopies: changes.filter(({ kind }) => kind === "covered-on-child").length,
    newParentArrivals: changes.filter(({ kind }) => kind === "uncovered-parent-arrival").length }, changes, hashes, errors };
writeGeneratedFile(path.join(stageRoot, "parent-story-routing-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ stats: report.stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
