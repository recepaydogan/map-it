import assert from "node:assert/strict";
import test from "node:test";
import { getMarkerOverlapZoom, getNormalizedMarkerZoom } from "./map-marker-zoom.ts";

test("overlap inspection jumps directly to 450% and never zooms further on repeat clicks", () => {
  for (const initial of [0.02, 0.2, 0.48, 1, 4]) {
    const zoom = getMarkerOverlapZoom(initial, "top");
    assert.equal(zoom, 4.5);
    assert.equal(getMarkerOverlapZoom(zoom, "top"), zoom);
  }
  assert.equal(getMarkerOverlapZoom(5, "top"), 5);
  assert.equal(getMarkerOverlapZoom(6.4, "top"), 6.4);
});

test("the inspection target uses the displayed zoom percentage for each projection", () => {
  assert.equal(getNormalizedMarkerZoom(getMarkerOverlapZoom(0.2, "isometric"), "isometric"), 4.5);
});
