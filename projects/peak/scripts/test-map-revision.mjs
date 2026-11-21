import assert from "node:assert/strict";
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repo = fileURLToPath(new URL("../", import.meta.url));
const source = join(repo, "artifacts", "peak-data");
const catalog = JSON.parse(await readFile(join(source, "catalog.json")));
const root = await mkdtemp(join(tmpdir(), "peak-map-revision-test-"));
try {
  await mkdir(join(root, "maps"));
  for (const directory of ["icons", "items"]) {
    await symlink(join(source, directory), join(root, directory), "junction");
  }
  for (const level of [...catalog.levels, ...catalog.specialLevels]) {
    const name = basename(level.mapImage);
    await link(join(source, "maps", name), join(root, "maps", name));
  }
  const revisedName = `level-0-${catalog.levels[0].mapBuildId}-lava-test.webp`;
  await link(join(source, "maps", basename(catalog.levels[0].mapImage)), join(root, "maps", revisedName));
  const check = async (mutate, valid, message) => {
    const fixture = structuredClone(catalog);
    mutate(fixture.levels[0]);
    await writeFile(join(root, "catalog.json"), JSON.stringify(fixture));
    const result = spawnSync(process.execPath, [join(repo, "scripts", "validate-peak-data.mjs"), "--data-directory", root], { encoding: "utf8" });
    assert.equal(result.status === 0, valid, result.stdout + result.stderr);
    if (!valid) assert.match(result.stderr, message);
  };
  await check(() => {}, true);
  await check(level => { level.mapRevision = "lava-test"; level.mapImage = `./data/peak/maps/${revisedName}`; }, true);
  await check(level => { level.mapRevision = "../escape"; }, false, /invalid map revision/);
  await check(level => { level.mapRevision = ""; }, false, /invalid map revision/);
  await check(level => { level.mapRevision = "lava-test"; }, false, /invalid map image/);
  await check(level => { level.mapImage = `./data/peak/maps/${revisedName}`; delete level.mapRevision; }, false, /invalid map image/);
  console.log("Map revision regressions passed: immutable revision URLs, legacy names, and malformed or mismatched revisions.");
} finally {
  await rm(root, { recursive: true, force: true });
}
