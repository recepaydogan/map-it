import fs from "node:fs";
import path from "node:path";

const parseArguments = (values) => {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    }
    result.set(key.slice(2), value);
  }
  for (const required of ["placements", "world-map-catalog", "output"]) {
    if (!result.has(required)) throw new Error(`Missing required argument: --${required}.`);
  }
  return result;
};

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const attributeValue = (attributes, name, fallback = null) => attributes?.[name]?.value ?? fallback;
const round = (value) => Math.round(value * 1_000_000) / 1_000_000;

const parseVector = (value) => {
  if (typeof value !== "string") return null;
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return { x: parts[0], y: parts[1], z: parts[2] };
};

const parseQuaternion = (value) => {
  if (typeof value !== "string") return null;
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [x, y, z, w] = parts;
  const magnitude = Math.hypot(x, y, z, w);
  if (magnitude < 0.999 || magnitude > 1.001) return null;
  return { x, y, z, w };
};

const normalizeLevelIdentity = (value) => value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
const levelNameFromTemplateInstance = (value) => {
  let result = value.trim();
  result = result.replace(/_\d{3}$/i, "");
  while (/^(?:S_|LT_)/i.test(result)) result = result.replace(/^(?:S_|LT_)/i, "");
  return result;
};

const parsePosition = (object) => {
  const transforms = Array.isArray(object?.Transform) ? object.Transform : object?.Transform ? [object.Transform] : [];
  return parseVector(attributeValue(transforms[0], "Position", ""));
};

const parseObjectTransform = (object) => {
  const transforms = Array.isArray(object?.Transform) ? object.Transform : object?.Transform ? [object.Transform] : [];
  const transform = transforms[0];
  const position = parseVector(attributeValue(transform, "Position", ""));
  const rotation = parseQuaternion(attributeValue(transform, "RotationQuat", "0 0 0 1"));
  const scale = Number(attributeValue(transform, "Scale", 1));
  if (!position || !rotation || !Number.isFinite(scale) || scale <= 0) return null;
  return { position, rotation, scale };
};

const rotateHorizontalPoint = ({ x, z }, rotation) => ({
  x: (1 - 2 * (rotation.y ** 2 + rotation.z ** 2)) * x
    + 2 * (rotation.x * rotation.z + rotation.w * rotation.y) * z,
  z: 2 * (rotation.x * rotation.z - rotation.w * rotation.y) * x
    + (1 - 2 * (rotation.x ** 2 + rotation.y ** 2)) * z,
});

const parseLocalBounds = (object, objectTransform) => {
  const { position: localPosition, rotation, scale } = objectTransform;
  const extents = parseVector(attributeValue(object, "Extents", ""));
  const localPoints = extents
    ? [
        { x: -extents.x, z: -extents.z },
        { x: -extents.x, z: extents.z },
        { x: extents.x, z: -extents.z },
        { x: extents.x, z: extents.z },
      ]
    : (object?.Points ?? [])
    .map((entry) => entry?.Object?.value ?? "")
    .map((value) => value.trim().split(/\s+/).map(Number))
    .filter((parts) => parts.length >= 2 && parts.every(Number.isFinite))
    .map(([x, z]) => ({ x, z }));
  if (localPoints.length < 3) return null;
  const points = localPoints.map((point) => {
    const rotated = rotateHorizontalPoint({ x: point.x * scale, z: point.z * scale }, rotation);
    return { x: localPosition.x + rotated.x, z: localPosition.z + rotated.z };
  });
  return {
    kind: extents ? "extents" : "polygon",
    minX: Math.min(...points.map(({ x }) => x)),
    maxX: Math.max(...points.map(({ x }) => x)),
    minZ: Math.min(...points.map(({ z }) => z)),
    maxZ: Math.max(...points.map(({ z }) => z)),
  };
};

const sourceIdentity = (root, filePath) => {
  const relativePath = path.relative(root, filePath).split(path.sep).join("/");
  const parts = relativePath.split("/");
  const levelsIndex = parts.indexOf("Levels");
  return {
    module: levelsIndex > 0 ? parts[levelsIndex - 1] : "unknown",
    level: levelsIndex >= 0 ? parts[levelsIndex + 1] : "unknown",
    relativePath,
  };
};

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const rotateQuarterTurns = (point, quarterTurns) => {
  const normalized = ((quarterTurns % 4) + 4) % 4;
  if (normalized === 1) return { x: -point.z, z: point.x };
  if (normalized === 2) return { x: -point.x, z: -point.z };
  if (normalized === 3) return { x: point.z, z: -point.x };
  return { x: point.x, z: point.z };
};

const main = () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const placementRoots = JSON.parse(arguments_.get("placements"));
  if (!Array.isArray(placementRoots) || placementRoots.length === 0) {
    throw new Error("--placements must be a non-empty JSON array.");
  }
  const worldMapCatalog = readJson(path.resolve(arguments_.get("world-map-catalog")));
  const rootTemplateCatalog = arguments_.has("root-template-catalog")
    ? readJson(path.resolve(arguments_.get("root-template-catalog")))
    : null;
  const levelTemplateRoot = arguments_.has("level-templates")
    ? path.resolve(arguments_.get("level-templates"))
    : null;
  const patches = (worldMapCatalog.levels ?? []).flatMap((level) => level.patches ?? []);
  const patchesByTriggerId = new Map(patches
    .filter((patch) => patch.triggerId)
    .map((patch) => [patch.triggerId.toLocaleLowerCase("en-US"), patch]));
  const matchesByIdentity = new Map();
  const placementLevels = new Map();

  for (const rootValue of placementRoots) {
    const root = path.resolve(rootValue);
    for (const filePath of walkFiles(root)
      .filter((candidatePath) => candidatePath.toLocaleLowerCase("en-US").endsWith(".lsj"))
      .sort((left, right) => left.localeCompare(right, "en"))) {
      const source = sourceIdentity(root, filePath);
      placementLevels.set(`${source.module}/${source.level}`, { module: source.module, level: source.level });
      const objects = readJson(filePath)?.save?.regions?.Templates?.GameObjects;
      if (!Array.isArray(objects)) continue;
      for (const object of objects) {
        const objectLevel = attributeValue(object, "LevelName", source.level);
        placementLevels.set(`${source.module}/${objectLevel}`, { module: source.module, level: objectLevel });
        const triggerId = attributeValue(object, "MapKey", "").toLocaleLowerCase("en-US");
        const patch = patchesByTriggerId.get(triggerId);
        if (!patch) continue;
        const objectTransform = parseObjectTransform(object);
        if (!objectTransform) continue;
        const localPosition = objectTransform.position;
        const localBounds = parseLocalBounds(object, objectTransform);
        if (!localBounds) continue;
        const localWidth = localBounds.maxX - localBounds.minX;
        const localHeight = localBounds.maxZ - localBounds.minZ;
        const dimensionTolerance = localBounds.kind === "polygon"
          ? 1.5
          : Math.max(0.25, Math.max(patch.worldBounds.width, patch.worldBounds.height) * 0.02);
        const directWidthError = Math.abs(localWidth - patch.worldBounds.width);
        const directHeightError = Math.abs(localHeight - patch.worldBounds.height);
        const swappedWidthError = Math.abs(localHeight - patch.worldBounds.width);
        const swappedHeightError = Math.abs(localWidth - patch.worldBounds.height);
        const directMatch = directWidthError <= dimensionTolerance && directHeightError <= dimensionTolerance;
        const swappedMatch = swappedWidthError <= dimensionTolerance && swappedHeightError <= dimensionTolerance;
        // A few official minimaps were authored with their world-map capture
        // rotated by a quarter turn. Their trigger dimensions are therefore
        // the exact inverse of the raster dimensions. Preserve that rigid
        // transform instead of rejecting the level and dropping its markers.
        const rotationQuarterTurns = directMatch ? 0 : swappedMatch ? 1 : 0;
        const axisAligned = directMatch || swappedMatch;
        const widthError = rotationQuarterTurns === 0 ? directWidthError : swappedWidthError;
        const heightError = rotationQuarterTurns === 0 ? directHeightError : swappedHeightError;
        // The world-map patch is centred on the region's geometry. Extents
        // regions are centred on the trigger, but polygon regions are offset
        // from their trigger, so the translation must use the bounds centre.
        const localCenter = {
          x: (localBounds.minX + localBounds.maxX) / 2,
          z: (localBounds.minZ + localBounds.maxZ) / 2,
        };
        const rotatedLocalCenter = rotateQuarterTurns(localCenter, rotationQuarterTurns);
        const match = {
          module: source.module,
          level: objectLevel,
          triggerId,
          triggerName: attributeValue(object, "Name", ""),
          localPosition,
          localCenter,
          worldCenter: {
            x: patch.worldBounds.centerX,
            z: patch.worldBounds.centerY,
          },
          offset: {
            x: patch.worldBounds.centerX - rotatedLocalCenter.x,
            z: patch.worldBounds.centerY - rotatedLocalCenter.z,
          },
          rotationQuarterTurns,
          dimensions: {
            localWidth,
            localHeight,
            worldWidth: patch.worldBounds.width,
            worldHeight: patch.worldBounds.height,
            widthError,
            heightError,
          },
          localBounds,
          dimensionTolerance,
          axisAligned,
          provenance: {
            placementPath: source.relativePath,
            worldMapPath: patch.provenance?.sourcePath ?? "",
          },
        };
        const matchIdentity = JSON.stringify([
          match.module,
          match.level,
          match.triggerId,
          match.localPosition,
          match.localBounds,
          match.worldCenter,
        ]);
        matchesByIdentity.set(matchIdentity, match);
      }
    }
  }
  const matches = [...matchesByIdentity.values()];

  const placementLevelsByNormalizedName = Map.groupBy(
    [...placementLevels.values()],
    ({ level }) => normalizeLevelIdentity(level),
  );
  const templateTransforms = [];
  const unmatchedTemplateInstances = [];
  if (levelTemplateRoot) {
    for (const filePath of walkFiles(levelTemplateRoot)
      .filter((candidatePath) => candidatePath.toLocaleLowerCase("en-US").endsWith(".lsj"))
      .sort((left, right) => left.localeCompare(right, "en"))) {
      const source = sourceIdentity(levelTemplateRoot, filePath);
      const objects = readJson(filePath)?.save?.regions?.Templates?.GameObjects;
      if (!Array.isArray(objects)) continue;
      for (const object of objects) {
        if (attributeValue(object, "Type", "").toLocaleLowerCase("en-US") !== "leveltemplate") continue;
        const name = attributeValue(object, "Name", "");
        const templateId = attributeValue(object, "TemplateName", "").toLocaleLowerCase("en-US");
        const subLevelName = rootTemplateCatalog?.templates?.[templateId]?.subLevelName;
        const inferredName = subLevelName || levelNameFromTemplateInstance(name);
        const candidates = placementLevelsByNormalizedName.get(normalizeLevelIdentity(inferredName)) ?? [];
        const sameModuleCandidates = candidates.filter(({ module }) => module === source.module);
        const selectedCandidates = sameModuleCandidates.length > 0 ? sameModuleCandidates : candidates;
        const transform = Array.isArray(object?.Transform) ? object.Transform[0] : object?.Transform;
        const position = parseVector(attributeValue(transform, "Position", ""));
        const rotation = parseQuaternion(attributeValue(transform, "RotationQuat", ""));
        const scale = Number(attributeValue(transform, "Scale", 1));
        const parentLevel = attributeValue(object, "LevelName", source.level);
        const mapKey = attributeValue(object, "MapKey", "").toLocaleLowerCase("en-US");
        if (selectedCandidates.length !== 1 || !position || !rotation || !Number.isFinite(scale) || scale <= 0) {
          unmatchedTemplateInstances.push({
            module: source.module,
            parentLevel,
            mapKey,
            name,
            inferredName,
            candidateLevels: selectedCandidates.map(({ module, level }) => `${module}/${level}`),
            provenance: { sourcePath: source.relativePath },
          });
          continue;
        }
        const child = selectedCandidates[0];
        templateTransforms.push({
          id: `${source.module}/${parentLevel}#${mapKey}`,
          mapKey,
          name,
          templateId,
          levelIdentitySource: subLevelName ? "root-template-sublevel" : "instance-name",
          childModule: child.module,
          childLevel: child.level,
          parentModule: source.module,
          parentLevel,
          position,
          rotation,
          scale,
          provenance: { sourcePath: source.relativePath },
        });
      }
    }
  }
  templateTransforms.sort((left, right) => left.id.localeCompare(right.id, "en"));
  unmatchedTemplateInstances.sort((left, right) => left.name.localeCompare(right.name, "en")
    || left.mapKey.localeCompare(right.mapKey, "en"));

  // Width and height cannot distinguish 0 from 180 degrees, or rotations of
  // square regions. Resolve those cases from the authored template hierarchy.
  const instancesByChild = Map.groupBy(templateTransforms,
    ({ childModule, childLevel }) => `${childModule}/${childLevel}`);
  const projectThroughInstance = (point, instance) => {
    const horizontal = rotateHorizontalPoint({ x: point.x * instance.scale, z: point.z * instance.scale }, instance.rotation);
    return { x: horizontal.x + instance.position.x, z: horizontal.z + instance.position.z };
  };
  const templateProjections = (module, level, point) => {
    const queue = [{ module, level, point, origin: { x: 0, z: 0 }, axis: { x: 1, z: 0 }, chain: [] }];
    const results = [];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current.chain.length >= 8) continue;
      for (const instance of instancesByChild.get(`${current.module}/${current.level}`) ?? []) {
        if (current.chain.includes(instance.id)) continue;
        if (Math.abs(instance.rotation.x) > 0.00001 || Math.abs(instance.rotation.z) > 0.00001) continue;
        const projection = {
          module: instance.parentModule,
          level: instance.parentLevel,
          point: projectThroughInstance(current.point, instance),
          origin: projectThroughInstance(current.origin, instance),
          axis: projectThroughInstance(current.axis, instance),
          chain: [...current.chain, instance.id],
        };
        results.push(projection);
        queue.push(projection);
      }
    }
    return results;
  };
  for (const match of matches) {
    const projections = templateProjections(match.module, match.level, match.localCenter)
      .filter(({ point, origin, axis }) => Math.hypot(point.x - match.worldCenter.x, point.z - match.worldCenter.z) <= 1.5
        && Math.abs(Math.hypot(axis.x - origin.x, axis.z - origin.z) - 1) < 0.0001);
    const rotations = [...new Set(projections.map(({ origin, axis }) =>
      ((Math.round(Math.atan2(axis.z - origin.z, axis.x - origin.x) / (Math.PI / 2)) % 4) + 4) % 4))];
    if (rotations.length !== 1) continue;
    const rotation = rotations[0];
    const expectedAxis = rotateQuarterTurns({ x: 1, z: 0 }, rotation);
    if (!projections.every(({ origin, axis }) => Math.hypot(
      axis.x - origin.x - expectedAxis.x,
      axis.z - origin.z - expectedAxis.z,
    ) < 0.0001)) continue;
    const rotatedCenter = rotateQuarterTurns(match.localCenter, rotation);
    const swapped = rotation % 2 === 1;
    const widthError = Math.abs((swapped ? match.dimensions.localHeight : match.dimensions.localWidth) - match.dimensions.worldWidth);
    const heightError = Math.abs((swapped ? match.dimensions.localWidth : match.dimensions.localHeight) - match.dimensions.worldHeight);
    if (widthError > match.dimensionTolerance || heightError > match.dimensionTolerance) continue;
    match.rotationQuarterTurns = rotation;
    match.offset = { x: match.worldCenter.x - rotatedCenter.x, z: match.worldCenter.z - rotatedCenter.z };
    match.dimensions.widthError = widthError;
    match.dimensions.heightError = heightError;
    match.axisAligned = true;
    match.rotationSource = "template-hierarchy";
    match.rotationTemplateChains = projections.map(({ chain }) => chain);
  }

  const groups = Map.groupBy(matches.filter(({ axisAligned }) => axisAligned), ({ module, level }) => `${module}/${level}`);
  const transforms = [];
  const spatialTransforms = [];
  const ambiguous = [];
  for (const [id, levelMatches] of groups) {
    const clusters = [];
    for (const match of levelMatches) {
      const cluster = clusters.find((candidate) => Math.hypot(
        candidate[0].offset.x - match.offset.x,
        candidate[0].offset.z - match.offset.z,
      ) <= 0.25 && candidate[0].rotationQuarterTurns === match.rotationQuarterTurns);
      if (cluster) cluster.push(match);
      else clusters.push([match]);
    }
    const toEntry = (cluster, spatial) => {
      const offsetX = median(cluster.map(({ offset }) => offset.x));
      const offsetZ = median(cluster.map(({ offset }) => offset.z));
      const maxDeviation = Math.max(...cluster.map(({ offset }) => Math.hypot(
        offset.x - offsetX,
        offset.z - offsetZ,
      )));
      return {
        id: spatial ? `${id}#${cluster[0].triggerId}` : id,
        levelTransformId: id,
        module: cluster[0].module,
        level: cluster[0].level,
        offset: { x: round(offsetX), z: round(offsetZ) },
        rotationQuarterTurns: cluster[0].rotationQuarterTurns,
        matchCount: cluster.length,
        maxDeviation: round(maxDeviation),
        regions: cluster.map(({ triggerId, localBounds }) => ({ triggerId, ...Object.fromEntries(
          Object.entries(localBounds).map(([key, value]) => [key, typeof value === "number" ? round(value) : value]),
        ) })),
        evidence: cluster.map((match) => ({
        triggerId: match.triggerId,
        triggerName: match.triggerName,
        localPosition: match.localPosition,
        localCenter: { x: round(match.localCenter.x), z: round(match.localCenter.z) },
        worldCenter: match.worldCenter,
        offset: { x: round(match.offset.x), z: round(match.offset.z) },
        rotationQuarterTurns: match.rotationQuarterTurns,
        rotationSource: match.rotationSource ?? "region-dimensions",
        ...(match.rotationTemplateChains ? { rotationTemplateChains: match.rotationTemplateChains } : {}),
        dimensions: Object.fromEntries(Object.entries(match.dimensions).map(([key, value]) => [key, round(value)])),
        localBounds: Object.fromEntries(Object.entries(match.localBounds)
          .map(([key, value]) => [key, typeof value === "number" ? round(value) : value])),
        provenance: match.provenance,
      })),
      };
    };
    if (clusters.length === 1) transforms.push(toEntry(clusters[0], false));
    else for (const cluster of clusters) spatialTransforms.push(toEntry(cluster, true));
  }
  transforms.sort((left, right) => left.id.localeCompare(right.id, "en"));
  spatialTransforms.sort((left, right) => left.id.localeCompare(right.id, "en"));
  ambiguous.sort((left, right) => left.id.localeCompare(right.id, "en"));
  const allTransforms = [...transforms, ...spatialTransforms];
  const catalog = {
    schemaVersion: 3,
    stats: {
      worldMapPatches: patches.length,
      matchedTriggers: matches.length,
      axisAlignedMatches: matches.filter(({ axisAligned }) => axisAligned).length,
      transforms: allTransforms.length,
      globalTransforms: transforms.length,
      spatialTransforms: spatialTransforms.length,
      translatedLevels: new Set(allTransforms
        .filter(({ offset }) => Math.hypot(offset.x, offset.z) > 0.25)
        .map(({ levelTransformId }) => levelTransformId)).size,
      ambiguousLevels: ambiguous.length,
      templateInstances: templateTransforms.length,
      templateChildLevels: new Set(templateTransforms.map(({ childModule, childLevel }) => `${childModule}/${childLevel}`)).size,
      unmatchedTemplateInstances: unmatchedTemplateInstances.length,
    },
    transforms,
    spatialTransforms,
    templateTransforms,
    unmatchedTemplateInstances,
    ambiguous,
    rejectedDimensionMatches: matches.filter(({ axisAligned }) => !axisAligned),
  };
  const outputPath = path.resolve(arguments_.get("output"));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Level transforms: ${catalog.stats.transforms} map-aligned and ${catalog.stats.templateInstances} template instances resolved; ${catalog.stats.ambiguousLevels} ambiguous map levels.`);
};

try {
  main();
} catch (error) {
  console.error("Level-transform catalog build failed:", error);
  process.exitCode = 1;
}
