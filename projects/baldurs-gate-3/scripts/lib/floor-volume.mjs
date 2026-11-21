import { applyLevelTransform, applyTemplateTransform } from "./level-coordinate-transform.mjs";

const vector = (value, length) => {
  const values = String(value ?? "").trim().split(/\s+/).map(Number);
  if (values.length !== length || !values.every(Number.isFinite)) throw new Error("Invalid native floor vector");
  return values;
};

/** Reproduce the same authored instance chain used for this map's objects. */
export const projectFloorPoint = (point, record) => {
  let result = point;
  for (const transform of record.templateProjection?.chain ?? []) result = applyTemplateTransform(result, transform);
  return applyLevelTransform(result, record.templateProjection?.mapTransform ?? record.positionTransform);
};

export const hasNativeFloorGeometry = (object) => Boolean(object?.Points || object?.Extents);

export const buildFloorVolume = (object, record) => {
  if (!record.position) throw new Error("Floor has no resolved map-space placement");
  const transform = object.Transform?.[0];
  const [x, y, z] = vector(transform?.Position?.value, 3);
  const [qx, qy, qz, qw] = vector(transform?.RotationQuat?.value ?? "0 0 0 1", 4);
  const scale = transform?.Scale?.value ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Invalid native floor scale");
  let vertices;
  let bottomHeight;
  let topHeight;
  const geometryType = object.Points ? "polygon" : "box";
  if (geometryType === "polygon") {
    const height = object.Height?.value;
    if (!Number.isFinite(height) || height <= 0) throw new Error("Invalid native floor height");
    vertices = object.Points.map((entry) => vector(entry.Object?.value, 2));
    if (vertices.length < 3) throw new Error("Native floor has no polygon");
    bottomHeight = 0;
    topHeight = height;
  } else {
    // Box trigger extents are centered half-sizes, unlike polygon height.
    const [ex, ey, ez] = vector(object.Extents?.value, 3);
    if ([ex, ey, ez].some((extent) => extent <= 0)) throw new Error("Invalid native floor box extents");
    vertices = [[-ex, -ez], [ex, -ez], [ex, ez], [-ex, ez]];
    bottomHeight = -ey;
    topHeight = ey;
  }
  const origin = projectFloorPoint({ x, y, z }, record);
  if (Math.hypot(origin.x - record.position.x, origin.y - record.position.y, origin.z - record.position.z) > 1e-4) {
    throw new Error("Native floor and published placement transforms disagree");
  }
  const localTransform = { position: { x, y, z }, rotation: { x: qx, y: qy, z: qz, w: qw }, scale };
  const point = (px, py, pz) => projectFloorPoint(applyTemplateTransform({ x: px, y: py, z: pz }, localTransform), record);
  const bottom = vertices.map(([px, pz]) => point(px, bottomHeight, pz));
  const top = vertices.map(([px, pz]) => point(px, topHeight, pz));
  if (bottom.some((value, index) => Math.hypot(value.x - top[index].x, value.z - top[index].z) > 1e-4)
    || Math.max(...bottom.map(({ y: py }) => py)) - Math.min(...bottom.map(({ y: py }) => py)) > 1e-4
    || bottom.some((value, index) => value.y >= top[index].y)) {
    throw new Error("Tilted native floor volume requires a 3D containment review");
  }
  return {
    id: record.id, sourceLevel: record.authoredLevel ?? record.level, geometryType,
    buildingId: object.BuildingUUID?.value ?? "", floor: object.Floor?.value,
    isRoof: object.IsRoof?.value === true,
    minHeight: Math.min(...bottom.map(({ y: py }) => py)),
    maxHeight: Math.max(...top.map(({ y: py }) => py)),
    polygon: bottom.map(({ x: px, z: pz }) => ({ x: px, z: pz })),
    provenance: record.provenance,
  };
};

/** Height is half-open so exactly shared floor boundaries do not double-bind. */
export const containsFloorPosition = (volume, point) => {
  if (!point || ![point.x, point.y, point.z].every(Number.isFinite)
    || point.y < volume.minHeight || point.y >= volume.maxHeight) return false;
  let inside = false;
  for (let index = 0, previous = volume.polygon.length - 1; index < volume.polygon.length; previous = index++) {
    const a = volume.polygon[previous];
    const b = volume.polygon[index];
    const cross = (point.x - a.x) * (b.z - a.z) - (point.z - a.z) * (b.x - a.x);
    if (Math.abs(cross) < 1e-8 && point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x)
      && point.z >= Math.min(a.z, b.z) && point.z <= Math.max(a.z, b.z)) return true;
    if ((a.z > point.z) !== (b.z > point.z)
      && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
};

/** Native floor volumes can overlap by a few millimetres at their shared edge. */
export const selectFloorVolume = (volumes, point) => volumes
  .filter((volume) => containsFloorPosition(volume, point))
  .sort((left, right) => right.minHeight - left.minHeight || left.id.localeCompare(right.id, "en"))[0] ?? null;

/** Independently compare the authored polygon with its native raster extent. */
export const floorRasterAlignment = (volume, patch) => {
  const world = patch.worldBounds;
  const raster = patch.sourceRaster;
  if (!world || !raster || ![world.centerX, world.centerY, world.width, world.height, raster.width, raster.height].every(Number.isFinite)
    || world.width <= 0 || world.height <= 0 || raster.width <= 0 || raster.height <= 0) {
    throw new Error("Floor raster alignment requires valid native dimensions and world bounds");
  }
  const x = volume.polygon.map((point) => point.x);
  const z = volume.polygon.map((point) => point.z);
  const edgeErrors = [
    (Math.min(...x) - (world.centerX - world.width / 2)) * raster.width / world.width,
    (Math.max(...x) - (world.centerX + world.width / 2)) * raster.width / world.width,
    (Math.min(...z) - (world.centerY - world.height / 2)) * raster.height / world.height,
    (Math.max(...z) - (world.centerY + world.height / 2)) * raster.height / world.height,
  ];
  return { edgeErrors, maxEdgeErrorPixels: Math.max(...edgeErrors.map(Math.abs)) };
};

/** Placement generation and coverage audits must use the same floor boundary. */
export const createFloorSelector = (selection, catalog) => {
  if (!selection) return () => true;
  if (!selection.mapId || !Array.isArray(selection.patchIds) || !selection.patchIds.length || !Array.isArray(catalog?.entries)) {
    throw new Error("Floor selection requires a source map, patch IDs and native volume catalog");
  }
  const selectedIds = new Set(selection.patchIds);
  if (selectedIds.size !== selection.patchIds.length) throw new Error("Duplicate selected floor patch");
  const entries = catalog.entries.filter((entry) => entry.mapId === selection.mapId && entry.status === "resolved-native-volume");
  const selected = entries.filter(({ volume }) => selectedIds.has(volume.id));
  if (selected.length !== selectedIds.size) throw new Error("Selected native floor volume is missing or still requires review");
  const buildings = new Set(selected.map(({ volume }) => volume.buildingId));
  const volumes = entries.filter(({ volume }) => buildings.has(volume.buildingId)).map(({ volume }) => volume);
  return (point) => selectedIds.has(selectFloorVolume(volumes, point)?.id);
};
