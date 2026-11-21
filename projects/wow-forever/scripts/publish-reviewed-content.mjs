/** Freeze an explicit English content scope over the current immutable release, then verify before activation. */
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadEnv } from "vite";
import { createReviewedContentPlan, validContentPath, isTranslationPath } from "./reviewed-content-plan.mjs";
import { releaseContentBaseUrl, uploadReleaseContent } from "./upload-release-content.mjs";

const root = path.resolve(import.meta.dirname, "..");
const configPath = path.join(root, "src/game-config.ts");
const env = loadEnv("production", root, "");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const safePath = (value) => validContentPath(value) && !isTranslationPath(value);
const safeStage = (stage) => path.dirname(path.resolve(stage)) === path.resolve(os.tmpdir())
  && path.basename(stage).startsWith("wow-forever-reviewed-");
const currentUrl = async () => (await readFile(configPath, "utf8"))
  .match(/DEFAULT_CONTENT_BASE_URL\s*=\s*"([^"]+)"/)?.[1];
const atomicJson = async (filename, value) => {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, filename);
};
const parallel = async (values, count, action) => {
  let cursor = 0;
  await Promise.all(Array.from({ length: count }, async () => {
    while (cursor < values.length) await action(values[cursor++]);
  }));
};
const manifestFor = async (base) => {
  const response = await fetch(`${base}/release-manifest.json`);
  if (!response.ok) throw new Error(`CDN manifest: HTTP ${response.status}`);
  const manifest = await response.json();
  if (manifest.fingerprint !== base.split("/").at(-1) || !Array.isArray(manifest.files)
    || new Set(manifest.files.map((file) => file.path)).size !== manifest.files.length
    || manifest.files.some((file) => !validContentPath(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256))) {
    throw new Error("Unsafe or inconsistent baseline manifest");
  }
  return manifest;
};

async function prepare(scopeFilename, receiptFilename) {
  const scope = await readJson(scopeFilename);
  if (scope.version !== 1 || !Array.isArray(scope.paths) || !scope.paths.length
    || new Set(scope.paths).size !== scope.paths.length || scope.paths.some((p) => !safePath(p))) {
    throw new Error("Scope must contain unique English content paths");
  }
  const base = await currentUrl();
  if (new URL(base).origin !== new URL(env.R2_PUBLIC_ORIGIN).origin) throw new Error("Unexpected CDN origin");
  const baseline = await manifestFor(base);
  const stage = await mkdtemp(path.join(os.tmpdir(), "wow-forever-reviewed-"));
  const selected = new Set(scope.paths);
  let local = 0;
  let restored = 0;
  await parallel(baseline.files.filter((file) => !selected.has(file.path)), 16, async (file) => {
    const source = path.join(root, "public", ...file.path.split("/"));
    const target = path.join(stage, ...file.path.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    const info = await stat(source).catch(() => undefined);
    const bytes = !isTranslationPath(file.path) && info?.size === file.size ? await readFile(source) : undefined;
    if (bytes && sha(bytes) === file.sha256) {
      await copyFile(source, target);
      local++;
    } else {
      const response = await fetch(`${base}/${file.path}`);
      if (!response.ok) throw new Error(`Cannot preserve ${file.path}: HTTP ${response.status}`);
      const content = Buffer.from(await response.arrayBuffer());
      if (content.length !== file.size || sha(content) !== file.sha256) throw new Error(`Invalid baseline bytes: ${file.path}`);
      await writeFile(target, content);
      restored++;
    }
  });
  for (const filename of scope.paths) {
    const source = path.join(root, "public", ...filename.split("/"));
    const target = path.join(stage, ...filename.split("/"));
    const bytes = await readFile(source);
    if (filename.endsWith(".json")) JSON.parse(bytes.toString("utf8"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  const plan = await createReviewedContentPlan(stage, baseline);
  const before = new Map(baseline.files.map((file) => [file.path, file]));
  const after = new Map(plan.files.map((file) => [file.path, file]));
  const changed = plan.files.filter((file) => before.get(file.path)?.sha256 !== file.sha256);
  if (baseline.files.some((file) => !after.has(file.path))
    || changed.some((file) => !selected.has(file.path)) || plan.files.some((file) => !validContentPath(file.path))) {
    throw new Error("Frozen release changed files outside the reviewed scope");
  }
  const receipt = {
    version: 1, status: "prepared", baseline: base, baselineManifestSha256: sha(Buffer.from(JSON.stringify(baseline))), stage,
    fingerprint: plan.fingerprint, url: releaseContentBaseUrl(env.R2_PUBLIC_ORIGIN, plan.fingerprint),
    fileCount: plan.files.length, bytes: plan.files.reduce((sum, file) => sum + file.size, 0),
    changed: changed.map(({ path: name, size, sha256 }) => ({ path: name, size, sha256 })),
    removed: [], translationFiles: 0, preservedBaselineLocales: baseline.files.filter((file) => isTranslationPath(file.path)).length,
    preservedLocal: local, restoredBaseline: restored,
  };
  await atomicJson(receiptFilename, receipt);
  console.log(JSON.stringify({ status: receipt.status, url: receipt.url, files: receipt.fileCount,
    changed: receipt.changed.length, translationFiles: 0, restoredBaseline: restored, receipt: receiptFilename }));
}

async function upload(receiptFilename) {
  const receipt = await readJson(receiptFilename);
  if (receipt.version !== 1 || receipt.status !== "prepared" || !safeStage(receipt.stage)
    || receipt.translationFiles !== 0 || receipt.removed.length) throw new Error("Not a prepared, safe release");
  if (await currentUrl() !== receipt.baseline) throw new Error("Pinned release changed since review");
  const baseline = await manifestFor(receipt.baseline);
  if (sha(Buffer.from(JSON.stringify(baseline))) !== receipt.baselineManifestSha256) throw new Error("Baseline manifest changed");
  const plan = await createReviewedContentPlan(receipt.stage, baseline);
  const old = new Map(baseline.files.map((file) => [file.path, file]));
  const changed = plan.files.filter((file) => old.get(file.path)?.sha256 !== file.sha256);
  if (plan.fingerprint !== receipt.fingerprint || plan.files.length !== receipt.fileCount
    || JSON.stringify(changed.map(({ path: name, size, sha256 }) => ({ path: name, size, sha256 }))) !== JSON.stringify(receipt.changed)
    || changed.some((file) => !safePath(file.path))
    || plan.files.some((file) => !validContentPath(file.path))) throw new Error("Frozen content changed after review");
  await uploadReleaseContent(plan, env);
  const typeFor = (filename) => filename.endsWith(".json") ? "application/json"
    : filename.endsWith(".webp") ? "image/webp" : filename.endsWith(".png") ? "image/png"
      : /\.jpe?g$/.test(filename) ? "image/jpeg" : filename.endsWith(".svg") ? "image/svg+xml"
        : filename.endsWith(".md") ? "text/markdown" : "text/plain";
  const changedPaths = new Set(changed.map((file) => file.path));
  const unchanged = plan.files.filter((file) => !changedPaths.has(file.path));
  const sampleCount = Math.min(32, unchanged.length);
  const samples = Array.from({ length: sampleCount }, (_, i) => unchanged[Math.floor(i * unchanged.length / sampleCount)]);
  const verify = [...changed, ...samples];
  let verified = 0;
  await parallel(verify, 8, async (file) => {
    const response = await fetch(`${receipt.url}/${file.path}`, { headers: { Origin: "http://127.0.0.1" } });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok || bytes.length !== file.size || sha(bytes) !== file.sha256
      || !response.headers.get("content-type")?.startsWith(typeFor(file.path))
      || !response.headers.get("cache-control")?.includes("immutable")
      || !response.headers.get("cache-control")?.includes("max-age=31536000")
      || response.headers.get("access-control-allow-origin") !== "*") {
      throw new Error(`Remote HTTP/hash/size/MIME/cache/CORS verification failed: ${file.path}`);
    }
    verified++;
    if (verified % 50 === 0 || verified === verify.length) console.log(`Verified remote content: ${verified}/${verify.length}`);
  });
  const previous = await manifestFor(receipt.baseline);
  if (sha(Buffer.from(JSON.stringify(previous))) !== receipt.baselineManifestSha256) throw new Error("Old release was modified");
  await atomicJson(receiptFilename, { ...receipt, status: "verified", verifiedChangedFiles: changed.length,
    verifiedUnchangedSamples: samples.length, oldReleasePreserved: true, activated: false });
  const source = await readFile(configPath, "utf8");
  if (!source.includes(`DEFAULT_CONTENT_BASE_URL = "${receipt.baseline}"`)) throw new Error("Pinned URL changed during verification");
  const next = source.replace(`DEFAULT_CONTENT_BASE_URL = "${receipt.baseline}"`, `DEFAULT_CONTENT_BASE_URL = "${receipt.url}"`);
  const temporary = `${configPath}.content-update.tmp`;
  await writeFile(temporary, next);
  await rename(temporary, configPath);
  await atomicJson(receiptFilename, { ...receipt, status: "verified", verifiedChangedFiles: changed.length,
    verifiedUnchangedSamples: samples.length, oldReleasePreserved: true, activated: true });
  if (!safeStage(receipt.stage)) throw new Error("Unsafe stage cleanup");
  await rm(receipt.stage, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  console.log(`Verified and pinned content: ${receipt.url}`);
}

const [mode, first, second] = process.argv.slice(2);
if (mode === "--prepare" && first && second && process.argv.length === 5) await prepare(path.resolve(first), path.resolve(second));
else if (mode === "--upload" && first && !second && process.argv.length === 4) await upload(path.resolve(first));
else throw new Error("Use --prepare scope.json receipt.json, then --upload receipt.json");
