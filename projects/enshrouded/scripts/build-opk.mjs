// Builds the release package: validate → clean → build → verify → zip → .opk
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "vite";
import { createReleaseContentPlan } from "./release-content.mjs";
import { releaseContentBaseUrl, uploadReleaseContent, verifyReleaseContent } from "./upload-release-content.mjs";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, ".release-dist");
const releaseEnv = loadEnv("production", root, "");
const remoteContent = Boolean(releaseEnv.R2_PUBLIC_ORIGIN?.trim());
const uploadContent = process.argv.includes("--upload-content");
if (process.argv.slice(2).some((argument) => argument !== "--upload-content")) {
  throw new Error("Unknown argument. Use --upload-content to explicitly publish R2 content.");
}
if (uploadContent && !remoteContent) {
  throw new Error("R2_PUBLIC_ORIGIN is required to upload release content.");
}
const manifestValidator = path.join(root, "scripts", "validate-manifest.mjs");
const validateManifest = (manifestPath) => execFileSync(
  process.execPath,
  ["--experimental-strip-types", manifestValidator, ...(manifestPath ? [manifestPath] : [])],
  { cwd: root, stdio: "inherit" },
);

// Fail before the expensive build if the source manifest is already invalid.
validateManifest();

// OneDrive keeps handles on directories while it syncs them, so removals can
// fail with EBUSY. Retry, and when a directory itself stays locked just empty
// it instead — a leftover empty folder is harmless, stale files are not.
const clearDirectory = (target) => {
  for (const entry of fs.readdirSync(target)) {
    const entryPath = path.join(target, entry);
    try {
      fs.rmSync(entryPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (error) {
      if (!["EBUSY", "EPERM", "ENOTEMPTY"].includes(error.code)) throw error;
      if (fs.lstatSync(entryPath).isDirectory()) clearDirectory(entryPath);
      else throw error;
    }
  }
};
if (fs.existsSync(dist)) clearDirectory(dist);

execSync("npm run build:position-reader", { cwd: root, stdio: "inherit" });
execSync("npm run build:icons", { cwd: root, stdio: "inherit" });
execSync("npx tsc -b", { cwd: root, stdio: "inherit" });
execSync("npx vite build --outDir .release-dist --emptyOutDir", {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, VITE_CONTENT_BASE_URL: "" },
});

if (remoteContent) {
  // Vite selects the map folders that ship with this game. Hash that exact set,
  // then rebuild with its immutable release URL embedded in the application.
  const contentPlan = await createReleaseContentPlan(dist);
  const remoteBaseUrl = releaseContentBaseUrl(releaseEnv.R2_PUBLIC_ORIGIN?.trim(), contentPlan.fingerprint);
  execSync("npx vite build --outDir .release-dist --emptyOutDir", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, VITE_CONTENT_BASE_URL: remoteBaseUrl },
  });
  const builtPlan = await createReleaseContentPlan(dist);
  if (builtPlan.fingerprint !== contentPlan.fingerprint) {
    throw new Error("Built content differs from the content selected for R2 upload.");
  }
  if (uploadContent) await uploadReleaseContent(builtPlan, releaseEnv);
  else {
    await verifyReleaseContent(builtPlan, releaseEnv.R2_PUBLIC_ORIGIN?.trim());
    console.log(`R2 content already published at ${remoteBaseUrl}`);
  }
  for (const directory of ["data", "maps"]) {
    const target = path.resolve(dist, directory);
    if (path.dirname(target) !== dist) throw new Error(`Unsafe release content directory: ${target}`);
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(dist, "manifest.json"), "utf8"));
validateManifest(path.join(dist, "manifest.json"));

// Schema validation cannot prove that paths declared by the manifest actually
// ship in the OPK. Check every local asset/window reference in the exact
// release directory before archiving it.
const referencedManifestFiles = new Set([
  manifest.meta.icon,
  manifest.meta.icon_gray,
  manifest.meta.launcher_icon,
  manifest.meta.tray_icon,
  manifest.meta.window_icon,
  manifest.data?.uninstall_window?.file,
  ...Object.values(manifest.data?.windows ?? {}).map((windowConfig) => windowConfig.file),
].filter(Boolean));

for (const relativePath of referencedManifestFiles) {
  if (!fs.existsSync(path.join(dist, ...relativePath.split("/")))) {
    throw new Error(`Manifest references a missing release file: ${relativePath}.`);
  }
}

const packageName = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).name;
const fileName = `${packageName}-${manifest.meta.version}`;
const zipPath = path.join(root, `${fileName}.zip`);
const opkPath = path.join(root, `${fileName}.opk`);

for (const output of [zipPath, opkPath]) {
  if (fs.existsSync(output)) fs.rmSync(output, { force: true });
}

// Windows ships bsdtar, whose `-a` picks the zip format from the extension.
execFileSync("tar", ["-a", "-c", "-f", zipPath, "-C", dist, ...fs.readdirSync(dist)], {
  cwd: root,
  stdio: "inherit",
});
fs.renameSync(zipPath, opkPath);
const archiveEntries = execFileSync("tar", ["-tf", opkPath], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);
if (!archiveEntries.includes("manifest.json")) {
  throw new Error("OPK must contain manifest.json at the archive root.");
}
if (archiveEntries.some((entry) => entry.startsWith("./"))) {
  throw new Error("OPK contains ./-prefixed entries that Overwolf cannot resolve reliably.");
}
if (remoteContent && archiveEntries.some((entry) => entry.startsWith("data/") || entry.startsWith("maps/"))) {
  throw new Error("CDN release OPK still contains remote content.");
}
const packageSizeMb = (fs.statSync(opkPath).size / (1024 * 1024)).toFixed(1);
console.log(`Created ${opkPath} (${packageSizeMb} MB).`);
