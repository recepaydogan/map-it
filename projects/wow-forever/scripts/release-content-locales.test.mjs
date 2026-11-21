import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { createReleaseContentPlan } from "./release-content.mjs";
import { localeRoots, verifyLocaleRelease } from "./locale-release.mjs";

test("map CDN content excludes independently published language packs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wow-forever-release-plan-"));
  try {
    for (const directory of localeRoots) {
      await mkdir(path.join(root, directory), { recursive: true });
      await writeFile(path.join(root, directory, "fr.json"), "locale pack");
    }
    await mkdir(path.join(root, "data", "catalog"), { recursive: true });
    await mkdir(path.join(root, "maps", "world-atlas"), { recursive: true });
    await writeFile(path.join(root, "data", "locales", "wow-forever", "deDE.json"), "client pack");
    await writeFile(path.join(root, "data", "catalog", "items.json"), "catalog");
    await writeFile(path.join(root, "maps", "world-atlas", "metadata.json"), "map");
    const plan = await createReleaseContentPlan(root);
    assert.deepEqual(plan.files.map(({ path: name }) => name), [
      "data/catalog/items.json", "maps/world-atlas/metadata.json"
    ]);
  } finally {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
});

test("packaging rejects missing or changed CDN locales before removing local copies", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wow-forever-locale-check-"));
  try {
    const content = "locale pack";
    const files = [];
    for (const directory of localeRoots) {
      await mkdir(path.join(root, directory), { recursive: true });
      await writeFile(path.join(root, directory, "fr.json"), content);
      files.push({ path: `${directory}/fr.json`, size: Buffer.byteLength(content),
        sha256: createHash("sha256").update(content).digest("hex") });
    }
    const fingerprint = "a".repeat(24);
    const manifest = { fingerprint, files };
    const fetchJson = async (url) => url.endsWith("current.json") ? { version: 1, fingerprint } : manifest;
    assert.equal(await verifyLocaleRelease(root, "https://cdn.example", fetchJson),
      `https://cdn.example/releases/${fingerprint}`);
    await writeFile(path.join(root, files[0].path), "unpublished translation edit");
    await assert.rejects(verifyLocaleRelease(root, "https://cdn.example", fetchJson), /Publish current locales/);
    assert.equal(await verifyLocaleRelease(root, "https://cdn.example", fetchJson, { matchLocalFiles: false }),
      `https://cdn.example/releases/${fingerprint}`);
    manifest.files = files.slice(1);
    await assert.rejects(verifyLocaleRelease(root, "https://cdn.example", fetchJson), /Publish current locales/);
    manifest.files = files;
    files[0].sha256 = "outdated";
    await assert.rejects(verifyLocaleRelease(root, "https://cdn.example", fetchJson), /Publish current locales/);
    manifest.fingerprint = "invalid";
    await assert.rejects(verifyLocaleRelease(root, "https://cdn.example", fetchJson), /Invalid published locale manifest/);
  } finally {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
});
