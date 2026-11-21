/** Publish the CDN data and selected maps without building an app or OPK. */
import { cp, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadEnv } from "vite";
import { createReleaseContentPlan } from "./release-content.mjs";
import { releaseContentBaseUrl, uploadReleaseContent } from "./upload-release-content.mjs";
import { exportAppLocales } from "./export-app-locales.mjs";

const root = path.resolve(import.meta.dirname, "..");
const registry = await readFile(path.join(root, "src/features/map/map-registry.ts"), "utf8");
const list = registry.match(/MAP_BUNDLED_ASSET_DIRS\s*=\s*\[([^\]]+)\]/)?.[1];
const configuredMaps = [...(list?.matchAll(/"([^"]+)"/g) ?? [])].map((match) => match[1]);
if (configuredMaps.length === 0) throw new Error("No bundled map folders found in map-registry.ts.");
const dryRun = process.argv.includes("--dry-run");
if (process.argv.slice(2).length !== 1 || !["--upload", "--dry-run"].includes(process.argv[2])) {
  throw new Error("Use --dry-run to inspect or --upload to publish content.");
}

await exportAppLocales(root);
const stage = await mkdtemp(path.join(os.tmpdir(), "enshrouded-map-content-"));
try {
  await cp(path.join(root, "public/data"), path.join(stage, "data"), { recursive: true });
  await mkdir(path.join(stage, "maps"));
  for (const name of configuredMaps) {
    await cp(path.join(root, "public/maps", name), path.join(stage, "maps", name), { recursive: true });
  }
  const plan = await createReleaseContentPlan(stage);
  const env = loadEnv("production", root, "");
  const baseUrl = env.R2_PUBLIC_ORIGIN?.trim()
    ? releaseContentBaseUrl(env.R2_PUBLIC_ORIGIN.trim(), plan.fingerprint)
    : null;
  const currentUrl = registry && (await readFile(path.join(root, "src/game-config.ts"), "utf8"))
    .match(/DEFAULT_CONTENT_BASE_URL\s*=\s*"([^"]+)"/)?.[1];
  if (currentUrl) {
    const response = await fetch(`${currentUrl}/release-manifest.json`);
    if (!response.ok) throw new Error(`Current CDN manifest: HTTP ${response.status}`);
    const previous = await response.json();
    const hashes = new Map(previous.files.map((file) => [file.path, file.sha256]));
    const changed = plan.files.filter((file) => hashes.get(file.path) !== file.sha256);
    const currentPaths = new Set(plan.files.map((file) => file.path));
    const removed = previous.files.filter((file) => !currentPaths.has(file.path));
    console.log(`Changed CDN files: ${changed.length}`);
    for (const file of changed) console.log(`  ${file.path}`);
    if (removed.length) console.log(`Removed CDN files: ${removed.map((file) => file.path).join(", ")}`);
  }
  if (dryRun) {
    console.log(`Planned content: ${plan.files.length} files, fingerprint ${plan.fingerprint}`);
    if (baseUrl) console.log(`Planned content URL: ${baseUrl}`);
  } else {
    if (!baseUrl) throw new Error("R2_PUBLIC_ORIGIN is required for a CDN release.");
    await uploadReleaseContent(plan, env);
    console.log(`New content URL: ${baseUrl}`);
  }
} finally {
  const tempRoot = path.resolve(os.tmpdir());
  const target = path.resolve(stage);
  if (!target.startsWith(`${tempRoot}${path.sep}`) || path.dirname(target) !== tempRoot) {
    throw new Error("Unsafe temporary content directory.");
  }
  await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
