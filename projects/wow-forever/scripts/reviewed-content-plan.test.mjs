import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createReviewedContentPlan, validContentPath } from "./reviewed-content-plan.mjs";

test("reviewed content preserves published legacy locales and rejects changed locale bytes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wow-reviewed-plan-test-"));
  try {
    await mkdir(path.join(root, "maps"));
    await mkdir(path.join(root, "data/classes/guides/locales/de"), { recursive: true });
    await writeFile(path.join(root, "data/catalog.json"), "{}");
    const filename = "data/classes/guides/locales/de/rogue.json";
    const bytes = Buffer.from('{"published":true}');
    await writeFile(path.join(root, filename), bytes);
    await writeFile(path.join(root, "data/classes/guides/locales/de/new.json"), "{}");
    const baseline = { files: [{ path: filename, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }] };
    const plan = await createReviewedContentPlan(root, baseline);
    assert.deepEqual(plan.files.map((f) => f.path), ["data/catalog.json", filename]);
    assert.equal(plan.files[1].sha256, baseline.files[0].sha256);
    assert.equal((await createReviewedContentPlan(root, baseline)).fingerprint, plan.fingerprint);
    await writeFile(path.join(root, filename), '{"localEdit":true}');
    await assert.rejects(createReviewedContentPlan(root, baseline), /Published locale changed/);
    assert.equal(validContentPath("data/../secret"), false);
    assert.equal(validContentPath("data/catalog.json"), true);
  } finally {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
});
