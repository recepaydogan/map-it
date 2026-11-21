import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const bundle = await build({ entryPoints: [fileURLToPath(new URL("./map-fishing-levels.ts", import.meta.url))],
  bundle: true, write: false, format: "esm", platform: "node" });
const { FISHING_LEVEL_ZONES: zones, fishingLevelLabels } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const zone = (id) => zones.find((entry) => entry.id === id);

test("native boundaries have valid rings and keep each label inside its own region", async () => {
  const boundaries = JSON.parse(await readFile(new URL("../../../public/data/gathering/fishing-boundaries.json", import.meta.url), "utf8"));
  assert.equal(boundaries.source.kind, "native-mcnk-area-boundaries");
  assert.equal(new Set(boundaries.regions.map((region) => region.id)).size, boundaries.regions.length);
  for (const region of boundaries.regions) {
    assert.ok(zone(region.id), region.id);
    let inside = false;
    const { x, y } = region.label;
    for (const ring of region.rings) {
      assert.ok(ring.length >= 3, region.id);
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[i], [bx, by] = ring[j];
        assert.ok(Number.isFinite(ax) && Number.isFinite(ay), region.id);
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
      }
    }
    assert.ok(inside, `${region.id} label must be inside native region`);
  }
  for (const id of ["elwynn-forest", "felwood", "riverglades", "zephras-isle", "bay-of-storms"]) {
    assert.ok(boundaries.regions.some((region) => region.id === id), id);
  }
  for (const id of ["ironforge", "undercity", "city-of-dalaran", "scalebeard-s-cave"]) {
    assert.ok(!boundaries.regions.some((region) => region.id === id), `${id} has no terrain boundary`);
  }
});

test("minimum casting needs are distinct from no-escape targets", () => {
  const thresholds = (id) => [zone(id).minimumSkill, zone(id).noEscapeSkill];
  assert.deepEqual(thresholds("the-barrens"), [1, 100]);
  assert.deepEqual(thresholds("riverglades"), [null, 225]);
  assert.equal(zone("riverglades").scope, "coast");
  assert.deepEqual(thresholds("zephras-isle"), [1, 25]);
  assert.deepEqual(thresholds("ashenvale"), [55, 150]);
  assert.deepEqual(thresholds("arathi-highlands"), [130, 225]);
  for (const id of ["mount-hyjal", "shen-dralas", "city-of-dalaran"]) assert.deepEqual(thresholds(id), [null, null]);
  for (const id of ["winterspring", "jademir-lake", "bay-of-storms", "hetaera-s-clutch", "scalebeard-s-cave"]) {
    assert.deepEqual(thresholds(id), [330, 425]);
  }
  assert.deepEqual(thresholds("jaguero-isle"), [205, 300]);
});

test("native region anchors agree with the existing gathering catalog", async () => {
  const gathering = JSON.parse(await readFile(new URL("../../../public/data/gathering/zones.json", import.meta.url), "utf8"));
  assert.equal(new Set(zones.map((z) => z.id)).size, zones.length);
  for (const entry of gathering.zones) {
    const anchor = zone(entry.id);
    assert.ok(anchor, entry.id);
    assert.ok(Math.abs(anchor.x - entry.x) < 0.01 && Math.abs(anchor.y - entry.y) < 0.01, entry.id);
  }
  for (const anchor of zones) {
    assert.ok(anchor.x >= 0 && anchor.x <= 32768 && anchor.y >= 0 && anchor.y <= 21845, anchor.name);
  }
});

test("labels stay attached while panning and show water details only close up", () => {
  const view = { centerX: 10000, centerY: 9000, zoom: 0.15 };
  const before = fishingLevelLabels(view, 20000, 20000, "top");
  const after = fishingLevelLabels({ ...view, centerX: 10100, centerY: 9200 }, 20000, 20000, "top");
  assert.deepEqual(before.map((z) => z.id), after.map((z) => z.id));
  for (let i = 0; i < before.length; i++) {
    assert.ok(Math.abs(after[i].left - before[i].left + 15) < 0.001);
    assert.ok(Math.abs(after[i].top - before[i].top + 30) < 0.001);
  }
  assert.ok(before.some((z) => z.kind === "water"));
  const overview = fishingLevelLabels({ ...view, zoom: 0.02 }, 20000, 20000, "top");
  assert.ok(overview.every((z) => z.kind === "zone" && !z.showName));
});
