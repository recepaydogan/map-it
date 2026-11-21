const distanceToRegion = (position, region) => Math.hypot(
  Math.max(region.minX - position.x, 0, position.x - region.maxX),
  Math.max(region.minZ - position.z, 0, position.z - region.maxZ),
);

const rankSpatialTransforms = (transforms, position) => transforms.map((transform) => {
  const distances = transform.regions.map((region) => distanceToRegion(position, region));
  const containingAreas = transform.regions
    .filter((region) => distanceToRegion(position, region) === 0)
    .map((region) => (region.maxX - region.minX) * (region.maxZ - region.minZ));
  return {
    transform,
    distance: Math.min(...distances),
    containingArea: containingAreas.length > 0 ? Math.min(...containingAreas) : Number.POSITIVE_INFINITY,
  };
}).sort((left, right) => left.distance - right.distance
  || left.containingArea - right.containingArea
  || right.transform.matchCount - left.transform.matchCount
  || left.transform.id.localeCompare(right.transform.id, "en"));

/** Shared by placement generation and independent source-coverage accounting. */
export const createLevelTransformResolver = (catalog) => {
  const byIdentity = new Map((catalog?.transforms ?? []).map((transform) => [`${transform.module}/${transform.level}`, transform]));
  const byLevel = Map.groupBy(catalog?.transforms ?? [], (transform) => transform.level);
  const spatial = Map.groupBy(catalog?.spatialTransforms ?? [], (transform) => `${transform.module}/${transform.level}`);
  const parentLevels = new Set((catalog?.templateTransforms ?? []).map(({ parentModule, parentLevel }) => `${parentModule}/${parentLevel}`));
  return (module, level, position) => {
    const key = `${module}/${level}`;
    const spatialTransforms = spatial.get(key) ?? [];
    if (position && spatialTransforms.length > 0) {
      const ranked = rankSpatialTransforms(spatialTransforms, position);
      if (ranked[0]?.distance === 0) return ranked[0].transform;
    }
    const appliesToParentPoint = (transform) => !parentLevels.has(key)
      || (Math.hypot(transform.offset.x, transform.offset.z) < 0.000001 && (transform.rotationQuarterTurns ?? 0) === 0)
      || (position && transform.regions.some((region) => distanceToRegion(position, region) === 0));
    const exact = byIdentity.get(key);
    if (exact && appliesToParentPoint(exact)) return exact;
    // Cross-module sources are usable only when the choice is unambiguous.
    const sameLevel = byLevel.get(level) ?? [];
    if (sameLevel.length === 1 && appliesToParentPoint(sameLevel[0])) return sameLevel[0];
    if (position) {
      const containing = rankSpatialTransforms(sameLevel.filter((transform) => (transform.regions?.length ?? 0) > 0), position)
        .filter(({ distance }) => distance === 0);
      if (containing.length === 1) return containing[0].transform;
    }
    return null;
  };
};

export const applyLevelTransform = (position, transform) => {
  if (!position || !transform) return position;
  const quarterTurns = ((transform.rotationQuarterTurns ?? 0) % 4 + 4) % 4;
  const horizontal = quarterTurns === 1 ? { x: -position.z, z: position.x }
    : quarterTurns === 2 ? { x: -position.x, z: -position.z }
      : quarterTurns === 3 ? { x: position.z, z: -position.x } : { x: position.x, z: position.z };
  return { ...position, x: horizontal.x + transform.offset.x, z: horizontal.z + transform.offset.z };
};

/** Apply the authored level-template instance, including height and scale. */
export const applyTemplateTransform = (position, transform) => {
  const scaled = { x: position.x * transform.scale, y: position.y * transform.scale, z: position.z * transform.scale };
  const { x: qx, y: qy, z: qz, w: qw } = transform.rotation;
  const dot = qx * scaled.x + qy * scaled.y + qz * scaled.z;
  const cross = { x: qy * scaled.z - qz * scaled.y, y: qz * scaled.x - qx * scaled.z, z: qx * scaled.y - qy * scaled.x };
  const scalar = qw * qw - (qx * qx + qy * qy + qz * qz);
  return {
    x: 2 * dot * qx + scalar * scaled.x + 2 * qw * cross.x + transform.position.x,
    y: 2 * dot * qy + scalar * scaled.y + 2 * qw * cross.y + transform.position.y,
    z: 2 * dot * qz + scalar * scaled.z + 2 * qw * cross.z + transform.position.z,
  };
};
