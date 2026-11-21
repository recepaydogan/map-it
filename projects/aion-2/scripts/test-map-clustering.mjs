import assert from "node:assert/strict";
import {
  CLUSTER_DETAIL_ZOOM,
  createMapPointClusters,
  getClusterDispersalZoom,
} from "../src/features/map/map-clustering.ts";
import {
  MARKER_DETAIL_ZOOM,
  MARKER_SIZE_MAX_ZOOM,
  getMapMarkerZoomScale,
  getMapMarkerZoomTier,
  getMarkerZoomFromNormalized,
  getNormalizedMarkerZoom,
  shouldClusterMapMarkers,
} from "../src/features/map/map-marker-zoom.ts";

const points = [
  { id: "food-1", name: "Food 1", category: "food", label: "Food", subtype: "restaurant", regionId: "test", region: "Test", x: 100, y: 100 },
  { id: "food-2", name: "Food 2", category: "food", label: "Food", subtype: "restaurant", regionId: "test", region: "Test", x: 150, y: 130 },
  { id: "medical-1", name: "Medical", category: "medical", label: "Medical", subtype: "clinic", regionId: "test", region: "Test", x: 130, y: 120 },
];

const project = (centerX, centerY) => points.map((point) => ({
  point,
  left: (point.x - centerX) * 0.2 + 500,
  top: (point.y - centerY) * 0.2 + 350,
}));

const beforePan = createMapPointClusters(project(0, 0), null, 0.2);
const afterPan = createMapPointClusters(project(80, 40), null, 0.2);
const clusterSizes = (clusters) => Object.fromEntries(
  clusters.map((cluster) => [cluster.key, cluster.items.length]),
);

assert.deepEqual(clusterSizes(afterPan), clusterSizes(beforePan));
assert.equal(beforePan.find((cluster) => cluster.categoryKey === "food")?.items.length, 2);
assert.equal(beforePan.find((cluster) => cluster.categoryKey === "medical")?.items.length, 1);

const selectedExcluded = createMapPointClusters(project(0, 0), "food-1", 0.2);
assert.equal(selectedExcluded.find((cluster) => cluster.categoryKey === "food")?.items.length, 1);

const boundaryPoints = [
  { ...points[0], id: "boundary-1", x: 87, y: 87 },
  { ...points[1], id: "boundary-2", x: 89, y: 89 },
].map((point) => ({ point, left: point.x, top: point.y }));
const regionalBoundaryClusters = createMapPointClusters(boundaryPoints, null, 0.44);
assert.equal(regionalBoundaryClusters.length, 1);
assert.equal(regionalBoundaryClusters[0]?.items.length, 2);
const detailBoundaryClusters = createMapPointClusters(boundaryPoints, null, 0.48);
assert.equal(detailBoundaryClusters.length, 2);
const maximumZoomClusters = createMapPointClusters(boundaryPoints, null, 1.4);
assert.equal(maximumZoomClusters.length, 2);
assert.ok(maximumZoomClusters.every((cluster) => cluster.items.length === 1));

const overlappingCategories = [
  { point: points[0], left: 100, top: 100 },
  { point: points[2], left: 104, top: 102 },
];
const offsetClusters = createMapPointClusters(overlappingCategories, null, 0.9);
assert.equal(offsetClusters.length, 2);
assert.ok(offsetClusters.every((cluster) => cluster.offsetX !== 0 || cluster.offsetY !== 0));

assert.equal(getMapMarkerZoomTier(0.035, "top"), "overview");
assert.equal(getMapMarkerZoomTier(0.2, "top"), "regional");
assert.equal(getMapMarkerZoomTier(0.6, "top"), "detail");
assert.ok(getMapMarkerZoomScale(0.02, "top") < 0.5);
assert.ok(getMapMarkerZoomScale(0.035, "top") < getMapMarkerZoomScale(0.1, "top"));
assert.equal(getMapMarkerZoomScale(0.12, "top"), 1);
assert.ok(getMapMarkerZoomScale(1, "top") > 1);
assert.ok(getMapMarkerZoomScale(1, "top") < getMapMarkerZoomScale(1.5, "top"));
assert.equal(getMapMarkerZoomScale(MARKER_SIZE_MAX_ZOOM, "top"), 1.5);
assert.equal(getMapMarkerZoomScale(3, "top"), 1.5);
assert.equal(getMapMarkerZoomScale(36, "isometric"), 1.5);
assert.equal(getMapMarkerZoomScale(72, "isometric"), 1.5);
assert.ok(Math.abs(getMapMarkerZoomScale(2.4, "isometric") - getMapMarkerZoomScale(0.1, "top")) < 1e-12);
assert.ok(Math.abs(getNormalizedMarkerZoom(2.4, "isometric") - 0.1) < Number.EPSILON);
assert.equal(shouldClusterMapMarkers(false, 0.01), false);
assert.equal(shouldClusterMapMarkers(true, 0.0349), true);
assert.equal(shouldClusterMapMarkers(true, 0.035), false);
assert.equal(shouldClusterMapMarkers(true, 0.04), false);
assert.ok(Math.abs(getMarkerZoomFromNormalized(0.1, "isometric") - 2.4) < 1e-9);
assert.equal(getMarkerZoomFromNormalized(0.45, "top"), 0.45);
assert.equal(CLUSTER_DETAIL_ZOOM, MARKER_DETAIL_ZOOM);

// One click on a cluster must land past the zoom where its own pins separate,
// rather than nudging the camera and handing back a smaller cluster.
const dispersalCases = [
  { points: [{ x: 0, y: 0 }, { x: 400, y: 0 }], expected: 0.12 },
  { points: [{ x: 0, y: 0 }, { x: 200, y: 0 }], expected: 0.22 },
  { points: [{ x: 0, y: 0 }, { x: 80, y: 0 }], expected: 0.34 },
  { points: [{ x: 0, y: 0 }, { x: 30, y: 0 }], expected: 0.45 },
  { points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], expected: 0.45 },
];
for (const { points: coordinates, expected } of dispersalCases) {
  const items = coordinates.map((coordinate, index) => ({
    point: { ...points[0], id: `dispersal-${index}`, ...coordinate },
    left: coordinate.x,
    top: coordinate.y,
  }));
  const dispersalZoom = getClusterDispersalZoom(items, true);
  assert.ok(
    dispersalZoom >= expected && dispersalZoom < expected * 1.01,
    `expected dispersal at ${expected}, got ${dispersalZoom}`,
  );
  assert.equal(createMapPointClusters(items, null, dispersalZoom).length, items.length);
}

// Automatic clustering stops at the detail tier, so tightly packed pins open there.
const packed = [
  { point: { ...points[0], id: "packed-1", x: 0, y: 0 }, left: 0, top: 0 },
  { point: { ...points[0], id: "packed-2", x: 2, y: 0 }, left: 2, top: 0 },
];
assert.ok(getClusterDispersalZoom(packed, false) >= 0.45);
assert.ok(getClusterDispersalZoom(packed, false) < 0.46);

console.log("Map marker semantic zoom and clustering remain stable.");
