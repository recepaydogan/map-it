// Builds the release package: validate → clean → build → verify → zip → .opk
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "vite";
import { createReleaseContentPlan } from "./release-content.mjs";
import { releaseContentBaseUrl, uploadReleaseContent } from "./upload-release-content.mjs";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, ".release-dist");
if (path.dirname(path.resolve(dist)) !== root || path.basename(dist) !== ".release-dist") {
  throw new Error("Release output must stay inside the project directory.");
}
const releaseEnv = loadEnv("production", root, "");
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

execSync("npm run prebuild", { cwd: root, stdio: "inherit" });
const contentPlan = await createReleaseContentPlan(path.join(root, "public"));
if (process.argv.includes("--local-only")) {
  const url = `${releaseContentBaseUrl(releaseEnv.R2_PUBLIC_ORIGIN?.trim(), contentPlan.fingerprint)}/release-manifest.json`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Existing CDN content is unavailable: HTTP ${response.status}.`);
  const published = await response.json();
  const expected = contentPlan.files.map(({ path, size, sha256 }) => ({ path, size, sha256 }));
  if (published.fingerprint !== contentPlan.fingerprint
    || JSON.stringify(published.files) !== JSON.stringify(expected)) {
    throw new Error("Existing CDN content does not match this local OPK.");
  }
  console.log("Existing CDN content verified; no upload requested.");
} else {
  await uploadReleaseContent(contentPlan, releaseEnv);
}
execSync("npx tsc -b", { cwd: root, stdio: "inherit" });
execSync("npx vite build --outDir .release-dist --emptyOutDir", { cwd: root, stdio: "inherit" });

const builtPlan = await createReleaseContentPlan(path.join(root, "public"));
if (builtPlan.fingerprint !== contentPlan.fingerprint) {
  throw new Error("Source content changed while the CDN release was being built.");
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
  ...Object.values(manifest.data?.["extra-objects"] ?? {}).map((plugin) => plugin.file),
].filter(Boolean));

for (const relativePath of referencedManifestFiles) {
  if (!fs.existsSync(path.join(dist, ...relativePath.split("/")))) {
    throw new Error(`Manifest references a missing release file: ${relativePath}.`);
  }
}
const appSlug = manifest.meta.name.normalize("NFKC").trim().toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, "-")
  .replace(/^-|-$/g, "");
if (!appSlug) throw new Error("Manifest app name cannot produce an OPK file name.");
const fileName = `${appSlug}-${manifest.meta.version}`;
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
if (archiveEntries.some((entry) => entry.startsWith("data/") || entry.startsWith("maps/"))) {
  throw new Error("CDN release OPK still contains remote content.");
}
const packageSizeMb = (fs.statSync(opkPath).size / (1024 * 1024)).toFixed(1);
console.log(`Created ${opkPath} (${packageSizeMb} MB).`);
