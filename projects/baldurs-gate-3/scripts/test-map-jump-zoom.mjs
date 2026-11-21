import assert from "node:assert/strict";
import { getMapJumpZoom } from "../src/features/map/map-jump-zoom.ts";

const preferences = {
  clusterMarkers: true,
  selectionZoomEnabled: true,
  selectionZoomPercent: 100,
};

for (const maximum of [1.6, 3]) {
  for (const current of [0.05, 0.22, 0.8, maximum]) {
    assert.equal(
      getMapJumpZoom(current, { ...preferences, selectionZoomEnabled: false }, maximum),
      current,
      "Disabling selection zoom must preserve the camera zoom on either map surface.",
    );
    const next = getMapJumpZoom(current, preferences, maximum);
    assert.ok(next >= current, "Selecting a point must not zoom out.");
    assert.ok(next <= maximum, "Selection zoom must respect the surface's zoom limit.");
  }
  assert.equal(getMapJumpZoom(0.22, preferences, maximum), 0.48);
  assert.equal(getMapJumpZoom(0.22, { ...preferences, selectionZoomPercent: 200 }, maximum), 0.96);
  assert.equal(getMapJumpZoom(0.22, { ...preferences, selectionZoomPercent: 1000 }, maximum), maximum);
}

console.log("Map selection zoom respects disabled preferences, existing close-ups and both surface limits.");
