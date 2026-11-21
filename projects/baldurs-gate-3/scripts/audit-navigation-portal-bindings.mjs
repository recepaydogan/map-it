import fs from "node:fs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";
import path from "node:path";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";
import { createPortalEndpointNormalizer, normalizeNavigationPortals, portalDistance, portalInstanceId } from "./lib/navigation-portal.mjs";

const root = path.resolve(import.meta.dirname, "..");
const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index], value = process.argv[index + 1];
  if (!["--maps-root", "--coverage-report", "--output"].includes(key) || !value || options.has(key)) {
    throw new Error(`Expected unique --maps-root, --coverage-report or --output argument: ${key}`);
  }
  options.set(key, value);
}
if (options.has("--maps-root") && !options.has("--output")) throw new Error("A staged binding audit requires an explicit --output");
const mapsRoot = path.resolve(root, options.get("--maps-root") ?? "public/maps");
const coveragePath = path.resolve(root, options.get("--coverage-report") ?? "public/maps/coverage-report.json");
const outputPath = path.resolve(root, options.get("--output") ?? "public/maps/portal-binding-report.json");
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
const transforms = read("map-sources/catalog/level-transforms.json");
const portals = normalizeNavigationPortals(read("map-sources/catalog/navigation-portals.json").portals,
  createPortalEndpointNormalizer(read("map-sources/catalog/world-map.json"), transforms));
const coverage = read(coveragePath);
const coverageById = new Map(coverage.portals.map((entry) => [portalInstanceId(entry), entry]));
const exclusions = new Map(coverage.excludedPortals.map((entry) => [portalInstanceId(entry), entry]));
const parents = Map.groupBy(transforms.templateTransforms, ({ childLevel }) => childLevel);
const ancestorCache = new Map();
const ancestors = (level) => {
  if (ancestorCache.has(level)) return ancestorCache.get(level);
  const result = new Set([level]);
  const queue = [level];
  while (queue.length > 0) {
    for (const { parentLevel } of parents.get(queue.shift()) ?? []) {
      if (result.has(parentLevel)) continue;
      result.add(parentLevel);
      queue.push(parentLevel);
    }
  }
  ancestorCache.set(level, result);
  return result;
};
const appearances = [];
const publishedById = new Map();
const mapIds = readRegisteredMapIds(fs.readFileSync(path.join(root, "src/features/map/map-registry.ts"), "utf8"));
for (const mapId of mapIds) {
  for (const entity of Object.values(read(path.join(mapsRoot, mapId, "content.json")).entities)) {
    const appearance = { mapId, contentId: entity.id, title: entity.title, sourceLevel: entity.sourceLevel,
      worldPosition: entity.worldPosition, navigationPortal: entity.navigationPortal };
    publishedById.set(entity.id, [...(publishedById.get(entity.id) ?? []), appearance]);
    if (entity.navigationPortal) appearances.push(appearance);
  }
}
const entries = portals.map((portal) => {
  const exclusion = exclusions.get(portal.instanceId);
  const mapCoverage = coverageById.get(portal.instanceId);
  const bound = appearances.filter(({ navigationPortal: candidate }) => candidate.id === portal.id
    && (candidate.instanceId === portal.instanceId || (
      (ancestors(candidate.level).has(portal.level) || ancestors(portal.level).has(candidate.level))
      && portalDistance(candidate.sourcePosition, portal.sourcePosition) < 10
      && portalDistance(candidate.targetPosition, portal.targetPosition) < 10
    )));
  const status = exclusion && bound.length > 0 ? "exclusion-conflict" : exclusion ? "reviewed-exclusion" : mapCoverage?.status !== "covered" ? "unresolved-map"
    : bound.some(({ navigationPortal }) => navigationPortal.instanceId === portal.instanceId) ? "bound-exact-instance"
      : bound.length > 0 ? "bound-equivalent-export" : "requires-binding-review";
  // Exact geometry with a different UUID is evidence to review, not an identity binding.
  const endpointMatches = status === "requires-binding-review" ? appearances.filter(({ navigationPortal: candidate }) => candidate.id !== portal.id
    && portalDistance(candidate.sourcePosition, portal.sourcePosition) < 0.01
    && portalDistance(candidate.targetPosition, portal.targetPosition) < 0.01) : [];
  return {
    instanceId: portal.instanceId, id: portal.id, module: portal.module, level: portal.level, status,
    sourcePosition: portal.sourcePosition, targetPosition: portal.targetPosition,
    sourceMapIds: mapCoverage?.source.mapIds ?? [], targetMapIds: mapCoverage?.target.mapIds ?? [],
    ...(exclusion ? { reason: exclusion.reason } : {}),
    boundAppearances: bound.map(({ navigationPortal, ...appearance }) => ({ ...appearance, instanceId: navigationPortal.instanceId })),
    ...(status === "requires-binding-review" ? { otherAppearances: (publishedById.get(portal.id) ?? [])
      .map(({ navigationPortal, ...appearance }) => ({ ...appearance, instanceId: navigationPortal?.instanceId ?? null })),
    matchingEndpointAppearances: endpointMatches.map(({ navigationPortal, ...appearance }) => ({ ...appearance,
      instanceId: navigationPortal.instanceId, sourcePosition: navigationPortal.sourcePosition, targetPosition: navigationPortal.targetPosition })) } : {}),
    provenance: portal.provenance,
  };
});
const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(),
  inputs: { mapsRoot, coveragePath },
  scope: "Source navigation instances compared with the selected map content's portal profiles, not merely with raster bounds. Review candidates can be retired or implicit navigation records; they are not automatically missing gameplay markers.",
  stats: { sourceInstances: entries.length, ...Object.fromEntries([...Map.groupBy(entries, ({ status }) => status)]
    .map(([status, matches]) => [status, matches.length])) },
  entries,
};
writeGeneratedFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log("Navigation binding audit:", report.stats);
const exclusionConflicts = entries.filter(({ status }) => status === "exclusion-conflict");
if (exclusionConflicts.length > 0) {
  throw new Error(`Coverage exclusions hide ${exclusionConflicts.length} published portal instances. Review their scene identities.`);
}
