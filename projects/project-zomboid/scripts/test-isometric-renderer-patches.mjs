import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { patchRendererMapCoordinates } from "./isometric-renderer-patches.mjs";

const root = mkdtempSync(join(tmpdir(), "pzim-renderer-patches-"));
try {
  const packageRoot = join(root, "pzmap2dzi");
  mkdirSync(packageRoot);
  const headerPath = join(packageRoot, "lotheader.py");
  const sourcesPath = join(packageRoot, "source_manager.py");
  writeFileSync(headerPath, String.raw`HEADER_FILE_PATTERN = re.compile('(\\d+)_(\\d+)\\.lotheader$')`);
  writeFileSync(sourcesPath, [
    String.raw`re.compile(r'^(\d+)_(\d+)\.lotheader$')`,
    String.raw`re.compile(r'^world_(\d+)_(\d+)\.lotpack$')`,
    String.raw`re.compile(r'^layer(-?\d+)_files/(\d+)/(\d+)_(\d+)\.webp$')`,
  ].join("\n"));
  patchRendererMapCoordinates(root);
  const header = readFileSync(headerPath, "utf8");
  const sources = readFileSync(sourcesPath, "utf8");
  const pythonPattern = header.match(/re.compile\('(.*)'\)/)[1].replaceAll("\\\\", "\\");
  const pattern = new RegExp(pythonPattern);
  for (const name of ["41_55.lotheader", "-108_-124.lotheader", "41_-124.lotheader"]) {
    assert.ok(pattern.test(name), `Signed map cell was excluded: ${name}`);
  }
  assert.ok(sources.includes(String.raw`^world_(-?\d+)_(-?\d+)\.lotpack$`));
  assert.ok(sources.includes(String.raw`^layer(-?\d+)_files/(\d+)/(\d+)_(\d+)\.webp$`));
  patchRendererMapCoordinates(root);
  assert.equal(readFileSync(headerPath, "utf8"), header);
  assert.equal(readFileSync(sourcesPath, "utf8"), sources);
  writeFileSync(headerPath, "unexpected renderer revision");
  assert.throws(() => patchRendererMapCoordinates(root), /patterns changed/);
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log("Renderer signed map coordinate patch tests passed.");
