import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { acquireLock, verifyPublicReleases } from "./build-map-it.mjs";
import { classifyContent } from "../config/app-content-policy.mjs";

test("full WoW development builds keep maps and large indexes on the CDN", () => {
  for (const file of ["maps/azeroth/tiles/0/0.webp", "maps/deadmines/metadata.json", "data/map-search/index.json", "data/spells/foreverdb/index.json", "data/guides/locales/fr/index.json"]) {
    assert.equal(classifyContent("wow-forever", file), "remote", file);
  }
  assert.equal(classifyContent("wow-forever", "data/reference/index.json"), "keep");
  assert.equal(classifyContent("wow-forever", "third-party/addon/main.lua"), "keep");
  assert.equal(classifyContent("wow-forever", "assets/main.js"), "keep");
});

test("concurrent builds cannot update the same imports or content plan", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "map-it-lock-"));
  try {
    const release = await acquireLock(folder);
    await assert.rejects(acquireLock(folder), /Another build/);
    await release();
    await (await acquireLock(folder))();
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test("missing or changed pinned CDN content stops the build", async () => {
  const bytes = Buffer.from('{"files":[]}');
  const release = { receipts: { game: { baseUrl: "https://example.invalid/immutable", manifestSha256: createHash("sha256").update(bytes).digest("hex") } } };
  await verifyPublicReleases(release, async () => new Response(bytes));
  await assert.rejects(verifyPublicReleases(release, async () => new Response("missing", { status: 404 })), /unavailable/);
  await assert.rejects(verifyPublicReleases(release, async () => new Response("changed")), /checksum changed/);
});
