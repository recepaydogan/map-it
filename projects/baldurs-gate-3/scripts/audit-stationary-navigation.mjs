import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import ts from "typescript";
import sharp from "sharp";
import { isStationaryNavigationPortal, areReciprocalPortals } from "./lib/navigation-portal.mjs";
import { verifyNativeEntranceAnchor } from "./lib/native-entrance-audit.mjs";
import { readStorySourceLines } from "./lib/story-source-lines.mjs";
import { createStoryRuleLookup } from "./lib/story-rule-context.mjs";
import { splitArguments, parseEndpoint } from "./lib/story-goal-facts.mjs";
import { getOutgoingConnectionKeys } from "../src/features/map/map-connection-directions.ts";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 6, "Usage: node --experimental-strip-types audit-stationary-navigation.mjs <full-before-raw> <region-after-raw> <review> <report>");
const root = path.resolve(import.meta.dirname, "..");
const [before, after, reviewPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute); hashes[path.relative(root, absolute).replaceAll("\\", "/")] = digest(data); return data;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const review = read(reviewPath), baseline = read(path.join(before, "stage-manifest.json")), manifest = read(path.join(after, "stage-manifest.json"));
assert.equal(review.schemaVersion, 1); assert.equal(manifest.kind, "unfinalized-placement-stage");
assert.deepEqual(omit(manifest, ["maps"]), omit(baseline, ["maps"]));
for (const [file, expected] of Object.entries(review.sourceHashes)) assert.equal(digest(bytes(file)), expected.toLowerCase(), `Changed reviewed source: ${file}`);
const config = read(manifest.configPath);
assert.deepEqual([...baseline.maps].sort(), config.maps.map(({ id }) => id).sort());
const nativeCatalog = read(config.navigationPortals), nativeFiles = new Map(), stationary = [];
const point = (value) => {
  const coordinates = value.trim().split(/\s+/).map(Number); assert(coordinates.length === 3 && coordinates.every(Number.isFinite));
  return Object.fromEntries(["x", "y", "z"].map((key, i) => [key, coordinates[i]]));
};
for (const portal of nativeCatalog.portals) {
  const file = path.join(root, "map-sources/converted/navigation-portals", portal.provenance.sourcePath);
  if (!nativeFiles.has(file)) nativeFiles.set(file, read(file).save.regions.PortalData.Portal);
  const source = nativeFiles.get(file).filter((row) => row.PortalUUID.value === portal.id);
  assert.equal(source.length, 1); const native = source[0];
  assert.deepEqual(portal.sourcePosition, point(native.Source.value)); assert.deepEqual(portal.targetPosition, point(native.Target.value));
  assert.equal(portal.sourceRegionId, native.Region.value); assert.equal(portal.targetRegionId, native.TargetRegion.value);
  const expected = native.Region.value === native.TargetRegion.value
    && ["x", "y", "z"].every((key) => point(native.Source.value)[key] === point(native.Target.value)[key]);
  assert.equal(isStationaryNavigationPortal(portal), expected, `Stationary classification differs from native coordinates: ${portal.id}`);
  if (expected) stationary.push({ id: portal.id, instanceId: `${portal.module}/${portal.level}/${portal.id}`, position: point(native.Source.value) });
}
assert.deepEqual(stationary.map(({ instanceId }) => instanceId), [review.portalInstanceId]);
let preservedPairs = 0;
for (let i = 0; i < nativeCatalog.portals.length; i++) for (let j = i + 1; j < nativeCatalog.portals.length; j++) {
  const a = nativeCatalog.portals[i], b = nativeCatalog.portals[j];
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const oldMatch = a.module === b.module && a.level === b.level && a.id !== b.id
    && distance(a.sourcePosition, b.targetPosition) < 10 && distance(a.targetPosition, b.sourcePosition) < 10;
  const affected = stationary.some(({ instanceId }) => [a, b].some((p) => `${p.module}/${p.level}/${p.id}` === instanceId));
  assert.equal(areReciprocalPortals(a, b), oldMatch && !affected);
  if (oldMatch && !affected) preservedPairs++;
}

const sourceCandidates = new Map(), targetCandidates = new Map(), retiredAppearances = [], allStats = { maps: baseline.maps.length, rebuiltMaps: manifest.maps.length, preservedCandidates: 0 };
for (const mapId of baseline.maps) {
  const file = `map-sources/catalog/${mapId}-placements.json`, old = read(path.join(before, file));
  const retirees = old.candidates.filter(({ id }) => id === review.retiredId);
  if (retirees.length) assert(manifest.maps.includes(mapId), `Affected map was not rebuilt: ${mapId}`);
  for (const candidate of old.candidates) {
    if (candidate.id === review.portalId) sourceCandidates.set(mapId, candidate);
    if (candidate.id === review.targetId) targetCandidates.set(mapId, candidate);
    if (candidate.navigationDestination?.instanceId === review.portalInstanceId) assert.equal(candidate.id, review.retiredId);
  }
  if (!manifest.maps.includes(mapId)) { allStats.preservedCandidates += old.candidates.length; continue; }
  const current = read(path.join(after, file));
  assert.deepEqual(current.candidates, old.candidates.filter(({ id }) => id !== review.retiredId));
  assert.deepEqual(omit(current, ["candidates", "stats", "generatedAt"]), omit(old, ["candidates", "stats", "generatedAt"]));
  assert.deepEqual(current.stats, { ...old.stats, candidates: old.stats.candidates - retirees.length,
    uniqueObjects: old.stats.uniqueObjects - 1, localizedObjects: old.stats.localizedObjects - 1 });
  for (const [file, field] of [[`public/maps/${mapId}/content.json`, "entities"], [`public/maps/${mapId}/locations.json`, "locations"]]) {
    const oldDocument = read(path.join(before, file)), document = read(path.join(after, file));
    assert.deepEqual(document, { ...oldDocument, [field]: oldDocument[field].filter(({ id }) => id !== review.retiredId) });
  }
  const rejectionFile = `map-sources/catalog/${mapId}-placement-rejections.json`;
  assert.deepEqual(read(path.join(after, rejectionFile)), read(path.join(before, rejectionFile)));
  for (const candidate of retirees) {
    assert.equal(candidate.navigationDestination.instanceId, review.portalInstanceId);
    assert.deepEqual(candidate.navigationDestination.sourcePosition, candidate.navigationDestination.targetPosition);
    assert.deepEqual(candidate.position, stationary[0].position);
    retiredAppearances.push({ mapId, id: candidate.id });
  }
  allStats.preservedCandidates += current.candidates.length;
}
assert.deepEqual(retiredAppearances.map(({ mapId }) => mapId).sort(), [review.parentMap, review.sourceMap].sort());
const source = sourceCandidates.get(review.sourceMap), target = targetCandidates.get(review.targetMap); assert(source && target);
for (const [candidate, file] of [[source, review.objectSource], [target, review.targetSource]]) {
  const native = read(file).save.regions.Templates.GameObjects.filter((row) => row.MapKey.value === candidate.id);
  assert.equal(native.length, 1); assert.equal(native[0].LevelName.value, candidate.level); assert.equal(native[0].TemplateName.value, candidate.templateId);
  assert.equal(native[0].Name.value, candidate.internalName);
  const nativePosition = point(native[0].Transform[0].Position.value);
  for (const key of ["x", "y", "z"]) assert(Math.abs(nativePosition[key] - candidate.position[key]) < 0.0001);
}
const floorConfig = config.maps.find(({ id }) => id === review.sourceMap), selection = floorConfig.floorVolumeSelection;
assert(selection); const floors = read(config.floorVolumes ?? "map-sources/catalog/floor-volumes.json");
const volumes = floors.entries.filter((row) => row.mapId === selection.mapId && row.status === "resolved-native-volume").map(({ volume }) => volume);
const selected = volumes.filter(({ id }) => selection.patchIds.includes(id)); assert.equal(selected.length, selection.patchIds.length);
const contains = (volume, p) => {
  if (p.y < volume.minHeight || p.y >= volume.maxHeight) return false;
  let inside = false;
  for (let i = 0, j = volume.polygon.length - 1; i < volume.polygon.length; j = i++) {
    const a = volume.polygon[i], b = volume.polygon[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
};
const onFloor = (p) => selection.patchIds.includes(volumes.filter((v) => selected.some((s) => s.buildingId === v.buildingId) && contains(v, p))
  .sort((a, b) => b.minHeight - a.minHeight || a.id.localeCompare(b.id, "en"))[0]?.id);
const metadata = read(`public/maps/${review.sourceMap}/metadata.json`);
const { data, info } = await sharp(bytes(`public/maps/${review.sourceMap}/overview.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const entranceEvidence = verifyNativeEntranceAnchor(source, { readJson: read, sourceRoot: path.join(root, "map-sources/converted/navigation-portals"),
  reference: metadata.coordinateReference, mask: { data, width: info.width, height: info.height, channels: info.channels }, onFloor });

const storyText = bytes(review.storySource).toString("utf8"), lines = readStorySourceLines(storyText).lines, lookup = createStoryRuleLookup(storyText);
const story = Object.fromEntries(Object.entries(review.storyLines).map(([name, line]) => {
  const statement = lines[line - 1].trim(), rule = lookup(line); assert(rule && !rule.debugOnly);
  return [name, { line, statement, rule, name: statement.match(/^([A-Za-z0-9_]+)\(/)?.[1], args: splitArguments(statement) }];
}));
const variable = (arg) => arg.replace(/^\([A-Z]+\)/, "").trim();
assert.equal(story.sourceEvent.name, "UseStarted"); assert.equal(parseEndpoint(story.sourceEvent.args[1]).id, review.portalId);
assert.equal(story.sourceDispatch.rule.sourceLine, story.sourceEvent.rule.sourceLine);
assert.equal(story.sourceDispatch.name, story.entryHead.name); assert.deepEqual(story.sourceDispatch.args, [story.sourceEvent.args[0]]);
assert.equal(story.entryCall.rule.sourceLine, story.entryHead.rule.sourceLine);
assert.equal(story.entryCall.name, story.fadeHead.name); assert.equal(story.entryCall.args[0], variable(story.entryHead.args[0]));
assert.equal(parseEndpoint(story.entryCall.args[1]).id, review.targetId);
assert.equal(story.fadeTeleport.rule.sourceLine, story.fadeHead.rule.sourceLine); assert.equal(story.fadeTeleport.name, "TeleportTo");
assert.deepEqual(story.fadeTeleport.args.slice(0, 2), story.fadeHead.args.map(variable));
assert.equal(story.directHead.name, story.entryHead.name); assert.equal(story.directTeleport.rule.sourceLine, story.directHead.rule.sourceLine);
assert.equal(story.directTeleport.name, "TeleportTo"); assert.equal(story.directTeleport.args[0], variable(story.directHead.args[0]));
assert.equal(parseEndpoint(story.directTeleport.args[1]).id, review.targetId);

// Read literal configuration with the TypeScript AST, without running app code.
const mapSource = bytes("src/features/map/map-config.ts").toString("utf8"), syntax = ts.createSourceFile("map-config.ts", mapSource, ts.ScriptTarget.Latest, true);
const literal = (node) => {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map((property) => {
    assert(ts.isPropertyAssignment(property)); return [ts.isIdentifier(property.name) ? property.name.text : literal(property.name), literal(property.initializer)];
  }));
  throw new Error(`Nonliteral connection configuration: ${node.getText(syntax)}`);
};
const readExport = (name) => {
  const declarations = syntax.statements.filter(ts.isVariableStatement).flatMap((statement) => statement.declarationList.declarations);
  const matches = declarations.filter((node) => ts.isIdentifier(node.name) && node.name.text === name); assert.equal(matches.length, 1); return literal(matches[0].initializer);
};
const aliases = readExport("MAP_LOCATION_ALIASES"), connections = readExport("MAP_CONNECTIONS");
assert.equal(aliases[review.retiredId], review.portalId);
const connection = connections.find(({ id }) => id === review.connectionId); assert(connection);
assert.deepEqual(connection, { id: review.connectionId, endpoints: [{ mapId: review.sourceMap, locationId: review.portalId },
  { mapId: review.targetMap, locationId: review.targetId }], evidence: "scripted-party-teleport", direction: "forward" });
const [fromKey, toKey] = connection.endpoints.map(({ mapId, locationId }) => `${mapId}:${locationId}`);
assert.deepEqual([...getOutgoingConnectionKeys(connections, fromKey)], [toKey]);
assert(!getOutgoingConnectionKeys(connections, toKey).has(fromKey));
for (const file of [import.meta.filename, "scripts/lib/navigation-portal.mjs", "scripts/build-placement-catalog.mjs", "scripts/build-map-search-index.mjs",
  "src/features/map/map-connection-directions.ts", "src/features/map/saved-map-storage.ts", "src/features/map/use-saved-map-state.ts", "src/features/map/map-workspace.tsx"]) bytes(file);
const report = { kind: "stationary-navigation-source-and-delta-audit", before, after, reviewPath, review, hashes, errors: [],
  stats: { ...allStats, nativePortals: nativeCatalog.portals.length, stationaryPortals: stationary.length, preservedReciprocalPairs: preservedPairs, retiredRawAppearances: retiredAppearances.length },
  retiredAppearances, entranceEvidence, connection, aliases, story,
  scope: "All native AI endpoints checked from original files; actual stationary/reciprocal selectors evaluated on native rows. All 160 previous raw candidates inventoried; nine actual rebuilds lose only two views of one synthetic stationary arrival. Source pivot/floor/image and normal directed story call chain independently verified. Saved-state changes are code/type review only, not live storage or simulated-case testing. Canonical relocation/removal, complete consumers and publication require separate audit." };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({ stats: report.stats, entranceEvidence, connection, errors: [] }, null, 2));
