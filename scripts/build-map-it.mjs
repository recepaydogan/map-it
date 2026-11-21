import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { run, root } from "./build-process.mjs";

const node = (...args) => run(process.execPath, args);
const python = (...args) => run("python", args);

export async function acquireLock(directory) {
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, "build.lock");
  let handle;
  try { handle = await fs.open(file, "wx"); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error(`Another build/import holds ${file}. If it was interrupted, check that its process has stopped before removing this lock.`);
  }
  await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  return async () => { await handle.close(); await fs.unlink(file); };
}

async function preparationFingerprint() {
  const hash = createHash("sha256");
  for (const name of ["scripts/prepare-app-content.mjs", "scripts/runtime/app-content-runtime.ts", "config/app-content-policy.mjs", "package-lock.json"]) {
    hash.update(name); hash.update(await fs.readFile(path.join(root, name)));
  }
  return hash.digest("hex");
}

export async function verifyPublicReleases(release, request = fetch) {
  for (const [app, receipt] of Object.entries(release.receipts)) {
    const response = await request(receipt.baseUrl + "/release-manifest.json", { cache: "no-store", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${app}: pinned CDN manifest is unavailable (HTTP ${response.status}).`);
    const hash = createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
    if (hash !== receipt.manifestSha256) throw new Error(`${app}: pinned CDN manifest checksum changed.`);
    console.log(`[content] ${app}: published release verified`);
  }
}

async function ensureLeanContent() {
  const { loadContentBuild } = await import("./app-content-build.mjs");
  const fingerprint = await preparationFingerprint();
  const receiptFile = path.join(root, ".content-cache/preparation-inputs.json");
  const previous = await fs.readFile(receiptFile, "utf8").then(JSON.parse).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  let content;
  try { content = await loadContentBuild(); }
  catch (error) { console.log(`[content] Preparing current inputs: ${error.message}`); }
  if (!content || previous?.fingerprint !== fingerprint) {
    await node("scripts/prepare-app-content.mjs");
    // Upload only data to immutable Map It namespaces; executable code stays
    // local. Publication verifies bytes before selecting the new release.
    await node("scripts/publish-app-content.mjs", "--no-configure-cors");
    content = await loadContentBuild();
    if (!content) throw new Error("Lean content is required; refusing a full-size fallback.");
    await fs.writeFile(receiptFile, JSON.stringify({ fingerprint }));
  } else {
    console.log("[content] Reusing verified compression, shared fonts and CDN plan.");
    await verifyPublicReleases(content.release);
  }
}

export async function buildMapIt(args = process.argv.slice(2)) {
  const scoped = args.filter(arg => /^--app=[a-z0-9-]+$/.test(arg));
  const flags = args.filter(arg => !scoped.includes(arg));
  if (scoped.length > 1 || flags.some(arg => !["--opk", "--import-only", "--publish-content"].includes(arg))
    || new Set(flags).size !== flags.length || (flags.includes("--import-only") && flags.length > 1)) {
    throw new Error("Use --opk, --import-only, --publish-content, or --app=<id> with a build.");
  }
  const releaseLock = await acquireLock(path.join(root, ".sync-cache"));
  try {
    console.log(scoped.length ? `[build] Refreshing ${scoped[0].slice(6)} and reusing the other verified imports.`
      : "[build] Checking all source apps and importing current complete releases.");
    await python("scripts/import-map-apps.py", ...scoped);
    await node("scripts/verify-imported-apps.mjs");
    if (args.includes("--import-only")) return;
    await ensureLeanContent();
    if (args.includes("--publish-content")) await node("scripts/publish-release-content.mjs", "--upload");
    await node("--experimental-strip-types", "scripts/validate-app-manifest.mjs");
    const tests = ["scripts/app-library-runtime.test.mjs", "scripts/app-launch-router.test.mjs", "scripts/app-hotkeys.test.mjs", "scripts/app-startup-selection.test.mjs", "scripts/app-content-runtime.test.mjs", "scripts/module-asset-build.test.mjs", "scripts/shared-account.test.mjs", "scripts/shared-account-session.test.mjs", "scripts/shared-account-signout.test.mjs", "scripts/shared-support-client.test.mjs"];
    await node("--experimental-strip-types", "--test", ...tests);
    await node("scripts/build-icons.mjs", "--public-only");
    await node("node_modules/typescript/bin/tsc", "-b");
    const output = args.includes("--opk") ? ".release-dist" : ".dev-build";
    await node("node_modules/vite/bin/vite.js", "build", "--outDir", output, "--emptyOutDir");
    await node("scripts/verify-build-output.mjs", output);
    // A source edit while Vite is running invalidates the result before dist
    // or the final OPK is replaced.
    await python("scripts/import-map-apps.py", "--verify-only", ...scoped);
    if (args.includes("--opk")) {
      const { packageApp } = await import("./package-app.mjs");
      await packageApp();
    } else await node("scripts/sync-app-build.mjs", output);
    console.log(`[build] ${args.includes("--opk") ? "OPK" : "dist"} ready; source releases and lean content verified.`);
  } finally { await releaseLock(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await buildMapIt(); }
  catch (error) { console.error(`Map It build stopped: ${error.message}`); process.exitCode = 1; }
}
