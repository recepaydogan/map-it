import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { createClientWorldProjector } from "../../../scripts/lib/project-client-world-position.mjs";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("./position-projection.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "node", write: false,
});
const { projectPlayerPosition } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`,
);

test("live coordinates match the atlas marker projection on every supported world", async () => {
  const metadata = JSON.parse(await readFile(new URL('../../../public/maps/world-atlas/metadata.json', import.meta.url)));
  const expected = createClientWorldProjector(metadata);
  for (const mapId of [0, 1, 2991]) for (const [x, y] of [[0, 0], [10337.2, 783.6], [-4000, -1000]]) {
    const actual = projectPlayerPosition(mapId, x, y);
    assert.equal(actual.mapId, 'azeroth');
    const point = expected(mapId, [x, y]);
    assert.ok(Math.abs(actual.x - point.x) < 1e-8);
    assert.ok(Math.abs(actual.y - point.y) < 1e-8);
  }
  assert.equal(projectPlayerPosition(9999, 0, 0), null);
  assert.equal(projectPlayerPosition(1, NaN, 0), null);
});

