import { applyLevelTransform, applyTemplateTransform, createLevelTransformResolver } from "./level-coordinate-transform.mjs";
import { resolveActionNavigationPortal } from "./native-teleport-actions.mjs";

export const portalInstanceId = ({ module, level, id }) => `${module}/${level}/${id.toLowerCase()}`;
export const portalDistance = (left, right) => left && right
  ? Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z)
  : Number.POSITIVE_INFINITY;
const horizontalDistance = (left, right) => left && right
  ? Math.hypot(left.x - right.x, left.z - right.z) : Number.POSITIVE_INFINITY;

// A stationary AI node can describe a usable entrance, but supplies no second
// endpoint. Keep its source profile without inventing an arrival or a route.
export const isStationaryNavigationPortal = (portal) => Boolean(portal.sourceRegionId && portal.targetRegionId)
  && portal.sourceRegionId === portal.targetRegionId
  && (portal.sourceWorldLevel ?? portal.level) === (portal.targetWorldLevel ?? portal.level)
  && portalDistance(portal.sourcePosition, portal.targetPosition) === 0;

export const isVerticalNavigationPortal = (portal) => Math.abs(portal.sourcePosition.y - portal.targetPosition.y) >= 1.5
  && (!portal.actionBinding || horizontalDistance(portal.sourcePosition, portal.targetPosition) < 10);

export const areReciprocalPortals = (left, right) => left.module === right.module
  && !isStationaryNavigationPortal(left) && !isStationaryNavigationPortal(right)
  && left.level === right.level && left.id !== right.id
  && portalDistance(left.sourcePosition, right.targetPosition) < 10
  && portalDistance(left.targetPosition, right.sourcePosition) < 10;

export const createPortalEndpointNormalizer = (worldMapCatalog, levelTransformCatalog) => {
  const resolveTransform = createLevelTransformResolver(levelTransformCatalog);
  const patches = (worldMapCatalog?.levels ?? []).flatMap((level) => (level.patches ?? [])
    .map((patch) => ({ ...patch, level: level.level })));
  const patchesById = Map.groupBy(patches, (patch) => patch.id);
  const patchesByLevel = Map.groupBy(patches, ({ level }) => level);
  const templatesByChild = Map.groupBy(levelTransformCatalog?.templateTransforms ?? [], ({ childModule, childLevel }) => `${childModule}/${childLevel}`);
  const contains = (patch, position) => patch.worldBounds
    && Math.abs(position.x - patch.worldBounds.centerX) <= patch.worldBounds.width / 2
    && Math.abs(position.z - patch.worldBounds.centerY) <= patch.worldBounds.height / 2;
  return (portal, position, regionId) => {
    // A parent export can already be in world space even if it overlaps a
    // template's local bounds. Its actual navigation region takes precedence.
    const worldRegion = (patchesById.get(regionId) ?? []).find((patch) => {
      const bounds = patch.worldBounds;
      return patch.level === portal.level && bounds
        && Math.abs(position.x - bounds.centerX) <= bounds.width / 2
        && Math.abs(position.z - bounds.centerY) <= bounds.height / 2;
    });
    if (worldRegion) return { position, transformId: null, coordinateSpace: "world-region" };
    const transform = resolveTransform(portal.module, portal.level, position);
    if (!transform) {
      const queue = [{ module: portal.module, level: portal.level, position, chain: [] }];
      const matches = [];
      while (queue.length > 0) {
        const current = queue.shift();
        if (current.chain.length >= 8) continue;
        for (const instance of templatesByChild.get(`${current.module}/${current.level}`) ?? []) {
          if (current.chain.includes(instance.id)) continue;
          const parent = {
            module: instance.parentModule, level: instance.parentLevel,
            position: applyTemplateTransform(current.position, instance), chain: [...current.chain, instance.id],
          };
          const parentPatches = patchesByLevel.get(parent.level) ?? [];
          if (parentPatches.some((patch) => contains(patch, parent.position))) matches.push(parent);
          else queue.push(parent);
        }
      }
      const unique = [...new Map(matches.map((match) => [[match.module, match.level,
        ...[match.position.x, match.position.y, match.position.z].map((value) => value.toFixed(4))].join("/"), match])).values()];
      if (unique.length === 1) {
        const [match] = unique;
        return { position: match.position, module: match.module, level: match.level,
          transformId: match.chain.join(" -> "), coordinateSpace: "template-instance" };
      }
    }
    return {
      position: applyLevelTransform(position, transform),
      transformId: transform?.id ?? null,
      coordinateSpace: transform ? "level-transform" : "authored",
    };
  };
};

export const normalizeNavigationPortals = (portals, normalizeEndpoint) => portals.map((portal) => {
  if (!portal.sourcePosition || !portal.targetPosition) {
    throw new Error(`Portal ${portalInstanceId(portal)} is missing an endpoint.`);
  }
  const source = normalizeEndpoint(portal, portal.sourcePosition, portal.sourceRegionId);
  const target = normalizeEndpoint(portal, portal.targetPosition, portal.targetRegionId);
  return {
    ...portal,
    instanceId: portalInstanceId(portal),
    authoredSourcePosition: portal.sourcePosition,
    authoredTargetPosition: portal.targetPosition,
    sourcePosition: source.position,
    targetPosition: target.position,
    sourceCoordinateSpace: source.coordinateSpace,
    targetCoordinateSpace: target.coordinateSpace,
    sourceTransformId: source.transformId,
    targetTransformId: target.transformId,
    sourceWorldLevel: source.level ?? portal.level,
    targetWorldLevel: target.level ?? portal.level,
  };
});

/** UUIDs identify reusable objects, not a particular scene instance. */
export const createNavigationPortalResolver = (portals, levelTransformCatalog) => {
  const byId = Map.groupBy(portals, ({ id }) => id.toLowerCase());
  const parentsByLevel = Map.groupBy(levelTransformCatalog?.templateTransforms ?? [], ({ childLevel }) => childLevel);
  const ancestorsByLevel = new Map();
  const ancestors = (level) => {
    if (ancestorsByLevel.has(level)) return ancestorsByLevel.get(level);
    const result = new Set([level]);
    const pending = [level];
    while (pending.length > 0) {
      for (const { parentLevel } of parentsByLevel.get(pending.shift()) ?? []) {
        if (result.has(parentLevel)) continue;
        result.add(parentLevel);
        pending.push(parentLevel);
      }
    }
    ancestorsByLevel.set(level, result);
    return result;
  };
  return (record, recordsById) => {
    const candidates = byId.get(record.id.toLowerCase()) ?? [];
    if (candidates.length === 0) return resolveActionNavigationPortal(record, recordsById, portals,
      (left, right) => ancestors(left).has(right) || ancestors(right).has(left));
    const sameLevel = candidates.filter(({ level }) => level === record.level);
    // Parent exports are valid only along an authored template hierarchy AND
    // near the placed source. A sibling instance must never supply a portal.
    // A ladder's model pivot can be a full floor below its navigation endpoint.
    // Match that authored object horizontally; reciprocal portal pairing still
    // compares all three dimensions and never ignores the endpoint height.
    const compatible = sameLevel.length > 0 ? sameLevel : candidates.filter((portal) => ancestors(record.level).has(portal.level)
      && horizontalDistance(portal.sourcePosition, record.position) < 10);
    const sameModule = compatible.filter(({ module }) => module === record.module);
    const preferred = sameModule.length > 0 ? sameModule : compatible;
    if (preferred.length === 0) return null;
    if (preferred.some((portal) => portalDistance(portal.sourcePosition, preferred[0].sourcePosition) > 0.01
      || portalDistance(portal.targetPosition, preferred[0].targetPosition) > 0.01)) return null;
    return preferred[0];
  };
};
