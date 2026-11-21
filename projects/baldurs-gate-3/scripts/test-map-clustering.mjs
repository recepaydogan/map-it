import assert from "node:assert/strict";
import {
  CLUSTER_DETAIL_ZOOM,
  createMapPointClusters,
  getClusterDispersalZoom,
} from "../src/features/map/map-clustering.ts";
import {
  MARKER_DETAIL_ZOOM,
  getMapMarkerZoomTier,
  getMarkerZoomFromNormalized,
  getNormalizedMarkerZoom,
  shouldClusterMapMarkers,
} from "../src/features/map/map-marker-zoom.ts";
import {
  createMapMarkerFanLayout,
  MARKER_FAN_SCRIM_MARGIN,
  MARKER_FAN_TRIGGER_RADIUS,
} from "../src/features/map/map-marker-fan.ts";

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

// The colocated-pin web mirrors the Elden Ring map's exact screen geometry.
assert.equal(MARKER_FAN_TRIGGER_RADIUS, 14);
assert.equal(MARKER_FAN_SCRIM_MARGIN, 28);
assert.deepEqual(createMapMarkerFanLayout(0), { offsets: [], outerRadius: 0 });
const twoPinFan = createMapMarkerFanLayout(2);
assert.equal(twoPinFan.outerRadius, 48);
assert.equal(twoPinFan.offsets.length, 2);
assert.ok(Math.abs(twoPinFan.offsets[0].x) < 1e-9);
assert.equal(twoPinFan.offsets[0].y, -48);
assert.ok(Math.abs(twoPinFan.offsets[1].x) < 1e-9);
assert.equal(twoPinFan.offsets[1].y, 48);
const largeFan = createMapMarkerFanLayout(107);
assert.equal(largeFan.offsets.length, 107);
assert.equal(largeFan.outerRadius, 268);
let closestFanFeet = Number.POSITIVE_INFINITY;
for (let index = 0; index < largeFan.offsets.length; index += 1) {
  for (let other = index + 1; other < largeFan.offsets.length; other += 1) {
    closestFanFeet = Math.min(
      closestFanFeet,
      Math.hypot(
        largeFan.offsets[index].x - largeFan.offsets[other].x,
        largeFan.offsets[index].y - largeFan.offsets[other].y,
      ),
    );
  }
}
assert.ok(closestFanFeet >= 44 - 1e-9);

console.log("Map marker semantic zoom and clustering remain stable.");
