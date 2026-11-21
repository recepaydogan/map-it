import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("./map-gathering-zoom-filter.ts", import.meta.url))],
  bundle: true, write: false, format: "esm", platform: "node",
});
const { filterGatheringForZoom, isZoomLimitedGatheringPoint, shouldFilterGatheringForZoom } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

test("only more than 5000 active pins below the displayed 5% trigger the filter", () => {
  assert.equal(shouldFilterGatheringForZoom(5000, 0.02, "top"), false);
  assert.equal(shouldFilterGatheringForZoom(5001, 0.0449, "top"), true);
  assert.equal(shouldFilterGatheringForZoom(5001, 0.045, "top"), false);
  assert.equal(shouldFilterGatheringForZoom(5001, 0.05, "top"), false);
  assert.equal(shouldFilterGatheringForZoom(5001, 0.1, "top"), false);
  assert.equal(shouldFilterGatheringForZoom(5001, 0.04 * 24, "isometric"), true);
  assert.equal(shouldFilterGatheringForZoom(5001, 0.05 * 24, "isometric"), false);
});

test("filter removes exactly the three gathering groups, including their selected or saved pins", () => {
  const hidden = ["gatherable", "gatherable-herb", "gatherable-ore", "gatherable-herb-black-lotus", "gatherable-fish-raw-nightfin-snapper"]
    .map((category, index) => ({ id: `gather-${index}`, category }));
  const kept = ["rare", "quest", "custom", "gatherable-cloth-silk-cloth", "gatherable-leather-thick-leather", "book"]
    .map((category, index) => ({ id: `other-${index}`, category }));
  assert.ok(hidden.every(isZoomLimitedGatheringPoint));
  assert.ok(kept.every((point) => !isZoomLimitedGatheringPoint(point)));
  const points = [...hidden, ...kept];
  assert.deepEqual(filterGatheringForZoom(points, true), kept);
  assert.equal(filterGatheringForZoom(points, false), points);
  assert.equal(points.length, hidden.length + kept.length);
});
