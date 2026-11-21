// Builds the release package: validate → clean → build → verify → zip → .opk
// Use --use-published-content --locale-release=<fingerprint> to pair immutable content and locale snapshots.
import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "vite";
import { createReleaseContentPlan } from "./release-content.mjs";
import { releaseContentBaseUrl, uploadReleaseContent, verifyReleaseContent } from "./upload-release-content.mjs";
import { verifyLocaleRelease } from "./locale-release.mjs";
import { verifyReleaseDungeonArtwork } from "./verify-release-dungeon-artwork.mjs";

const root = path.resolve(import.meta.dirname, "..");
const englishOnly = process.argv.includes("--english-only");
const usePublishedContent = process.argv.includes("--use-published-content");
const pinnedLocaleArgument = process.argv.slice(2).find((argument) => argument.startsWith("--locale-release="));
const pinnedLocaleFingerprint = pinnedLocaleArgument?.slice("--locale-release=".length);
if (pinnedLocaleArgument && !/^[a-f0-9]{24}$/.test(pinnedLocaleFingerprint)) {
  throw new Error("--locale-release requires a 24-character CDN fingerprint.");
}
if (pinnedLocaleFingerprint && !usePublishedContent) {
  throw new Error("A pinned locale release requires --use-published-content.");
}
const dist = path.join(root, englishOnly ? ".release-en-dist" : ".release-dist");
if (path.dirname(dist) !== root) throw new Error(`Unsafe release directory: ${dist}`);
const releaseEnv = loadEnv("production", root, "");
const remoteContent = usePublishedContent || Boolean(releaseEnv.R2_PUBLIC_ORIGIN?.trim());
const uploadContent = process.argv.includes("--upload-content");
if (process.argv.slice(2).some((argument) => !["--upload-content", "--english-only", "--use-published-content"].includes(argument)
  && argument !== pinnedLocaleArgument)) {
  throw new Error("Unknown argument. Supported: --upload-content, --english-only, --use-published-content, --locale-release=<fingerprint>.");
}
if (usePublishedContent && uploadContent) {
  throw new Error("Cannot upload content while reusing the published CDN release.");
}
if (uploadContent && !remoteContent) {
  throw new Error("R2_PUBLIC_ORIGIN is required to upload release content.");
}
if (englishOnly && !remoteContent) {
  throw new Error("English-only packages require CDN content. Use --use-published-content to reuse the pinned release.");
}
let pinnedBaseUrl = "";
let pinnedQuestCatalogSha256 = "";
if (usePublishedContent) {
  const config = fs.readFileSync(path.join(root, "src", "game-config.ts"), "utf8");
  pinnedBaseUrl = config.match(/export const DEFAULT_CONTENT_BASE_URL = "([^"]+)";/)?.[1] ?? "";
  const url = new URL(pinnedBaseUrl);
  const fingerprint = url.pathname.match(/^\/releases\/([a-f0-9]{24})$/)?.[1];
  if (url.protocol !== "https:" || !fingerprint || url.search || url.hash) {
    throw new Error("A pinned HTTPS CDN release is required.");
  }
  const response = await fetch(`${pinnedBaseUrl}/release-manifest.json`);
  if (!response.ok) throw new Error(`Published CDN manifest: HTTP ${response.status}`);
  const published = await response.json();
  if (published.fingerprint !== fingerprint || !Array.isArray(published.files) || !published.files.length) {
    throw new Error("Invalid published CDN manifest.");
  }
  for (const required of ["data/spells/foreverdb/index.json", "data/spells/foreverdb/classes.json"]) {
    if (!published.files.some((file) => file.path === required)) throw new Error(`Published CDN is missing ${required}.`);
  }
  pinnedQuestCatalogSha256 = published.files.find((file) => file.path === "data/quests/quest-details.json")?.sha256 ?? "";
  console.log(`Reusing published CDN content: ${pinnedBaseUrl}`);
}
const localeBaseUrl = remoteContent && !englishOnly
  ? await verifyLocaleRelease(path.join(root, "public"),
    new URL(pinnedBaseUrl || releaseEnv.R2_PUBLIC_ORIGIN.trim()).origin,
    pinnedLocaleFingerprint ? async (url) => {
      if (url.endsWith("/locales/wow-forever/current.json")) return { version: 1, fingerprint: pinnedLocaleFingerprint };
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
      if (!response.ok) throw new Error(`Locale CDN: HTTP ${response.status} at ${url}`);
      return response.json();
    } : undefined, { matchLocalFiles: !usePublishedContent })
  : "";
if (localeBaseUrl) console.log(`Verified CDN locales: ${localeBaseUrl}`);
if (pinnedLocaleFingerprint) {
  const response = await fetch(`${localeBaseUrl}/data/locales/wow-forever/quest-text-source.json`);
  if (!response.ok) throw new Error(`Pinned quest locale source: HTTP ${response.status}`);
  const source = await response.json();
  if (!pinnedQuestCatalogSha256 || source.provenance?.catalogSha256 !== pinnedQuestCatalogSha256) {
    throw new Error("Pinned quest locale source does not match the selected content catalog.");
  }
}
const buildRelease = (baseUrl) => execFileSync(process.execPath, [
  path.join(root, "node_modules", "vite", "bin", "vite.js"),
  "build", "--outDir", path.relative(root, dist), "--emptyOutDir",
], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, VITE_CONTENT_BASE_URL: baseUrl, VITE_LOCALE_CONTENT_BASE_URL: localeBaseUrl,
    WOW_FOREVER_ENGLISH_ONLY: englishOnly ? "1" : "0", WOW_FOREVER_RELEASE: "1" },
});
const manifestValidator = path.join(root, "scripts", "validate-manifest.mjs");
const validateManifest = (manifestPath) => execFileSync(
  process.execPath,
  ["--experimental-strip-types", manifestValidator, ...(manifestPath ? [manifestPath] : [])],
  { cwd: root, stdio: "inherit" },
);

// Fail before the expensive build if the source manifest is already invalid.
execFileSync(process.execPath, [path.join(root, "scripts", "fix-en-locale-encoding.mjs"), "--check"],
  { cwd: root, stdio: "inherit" });
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

execSync("npm run build:icons", { cwd: root, stdio: "inherit" });
execSync("npx tsc -b", { cwd: root, stdio: "inherit" });
buildRelease(pinnedBaseUrl);

if (remoteContent) {
  // Vite selects the map folders that ship with this game. Hash that exact set,
  // then rebuild with its immutable release URL embedded in the application.
  if (!usePublishedContent) {
    const contentPlan = await createReleaseContentPlan(dist);
    const remoteBaseUrl = releaseContentBaseUrl(releaseEnv.R2_PUBLIC_ORIGIN?.trim(), contentPlan.fingerprint);
    buildRelease(remoteBaseUrl);
    const builtPlan = await createReleaseContentPlan(dist);
    if (builtPlan.fingerprint !== contentPlan.fingerprint) {
      throw new Error("Built content differs from the content selected for R2 upload.");
    }
    if (uploadContent) await uploadReleaseContent(builtPlan, releaseEnv);
    else {
      await verifyReleaseContent(builtPlan, releaseEnv.R2_PUBLIC_ORIGIN?.trim());
      console.log(`R2 content already published at ${remoteBaseUrl}`);
    }
  }
  // All catalogs and language packs are hosted; only the position projection stays local.
  const dataDirectory = path.resolve(dist, "data");
  if (path.dirname(dataDirectory) !== dist || fs.lstatSync(dataDirectory).isSymbolicLink()) {
    throw new Error(`Unsafe release content directory: ${dataDirectory}`);
  }
  for (const entry of fs.readdirSync(dataDirectory, { withFileTypes: true })) {
    if (entry.name === "live-position-projection.json" && entry.isFile()) continue;
    const target = path.resolve(dataDirectory, entry.name);
    if (path.dirname(target) !== dataDirectory || entry.isSymbolicLink()) {
      throw new Error(`Unsafe release content entry: ${target}`);
    }
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
  const mapsDirectory = path.resolve(dist, "maps");
  if (path.dirname(mapsDirectory) !== dist) throw new Error(`Unsafe release content directory: ${mapsDirectory}`);
  fs.rmSync(mapsDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

const dungeonCatalog = JSON.parse(fs.readFileSync(path.join(root, "public", "data", "dungeons", "maps.json"), "utf8"));
await verifyReleaseDungeonArtwork(dist, dungeonCatalog, remoteContent);

const manifest = JSON.parse(fs.readFileSync(path.join(dist, "manifest.json"), "utf8"));
// The standalone map addon is an unpublished development project.
const assertNoPrototypeAddon = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (/addon-prototype|map-prototype|wfm-map-prototype/i.test(entry.name)) {
      throw new Error(`Unpublished addon must not ship: ${entry.name}`);
    }
    if (entry.isDirectory()) assertNoPrototypeAddon(path.join(directory, entry.name));
  }
};
assertNoPrototypeAddon(dist);
for (const name of fs.readdirSync(path.join(dist, "assets")).filter(name => name.endsWith(".js"))) {
  if (fs.readFileSync(path.join(dist, "assets", name), "utf8").includes("mapAddonPrototype")) {
    throw new Error("Unpublished addon locale must not ship in application bundles.");
  }
}
// Development auto-refresh belongs to local builds, not distributed packages.
if (manifest.data?.developer) {
  delete manifest.data.developer;
  fs.writeFileSync(path.join(dist, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}
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
const fileName = `${packageName}-${manifest.meta.version}${englishOnly ? "-en" : ""}`;
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
if (remoteContent && archiveEntries.some((entry) =>
  entry.startsWith("maps/") || (entry.startsWith("data/")
    && entry !== "data/" && entry !== "data/live-position-projection.json"))) {
  throw new Error("CDN release OPK still contains remote content.");
}
if (localeBaseUrl) {
  const scripts = fs.readdirSync(path.join(dist, "assets")).filter((name) => name.endsWith(".js"))
    .map((name) => fs.readFileSync(path.join(dist, "assets", name), "utf8")).join("\n");
  if (!scripts.includes(localeBaseUrl)) throw new Error("Verified locale snapshot is missing from the application.");
}
if (englishOnly) {
  if (archiveEntries.some((entry) => entry.startsWith("data/locales/"))) {
    throw new Error("English release still contains game language packs.");
  }
  const scripts = fs.readdirSync(path.join(dist, "assets")).filter((name) => name.endsWith(".js"))
    .map((name) => fs.readFileSync(path.join(dist, "assets", name), "utf8")).join("\n");
  const languages = [...scripts.matchAll(/supportedAppLanguages:\[([^\]]*)\]/g)];
  if (!languages.length || languages.some((match) => match[1] !== '"en"')) {
    throw new Error("English release must expose only English.");
  }
  if (usePublishedContent && !scripts.includes(pinnedBaseUrl)) throw new Error("Pinned CDN URL is missing from the application.");
}
// Keep the unpacked folder used for local Overwolf installs on the same build as the OPK.
const unpackedDist = path.resolve(root, "dist");
if (path.dirname(unpackedDist) !== root || unpackedDist === dist) {
  throw new Error(`Unsafe unpacked release directory: ${unpackedDist}`);
}
if (fs.existsSync(unpackedDist)) {
  if (fs.lstatSync(unpackedDist).isSymbolicLink() ||
      fs.realpathSync(unpackedDist) !== path.join(fs.realpathSync(root), "dist")) {
    throw new Error(`Unpacked release directory must be local to this project: ${unpackedDist}`);
  }
}
const sameBytes = (left, right) => fs.existsSync(right) && fs.lstatSync(right).isFile() &&
  fs.statSync(left).size === fs.statSync(right).size &&
  createHash("sha256").update(fs.readFileSync(left)).digest("hex") ===
    createHash("sha256").update(fs.readFileSync(right)).digest("hex");
const syncReleaseDirectory = (source, target) => {
  if (target !== unpackedDist && !target.startsWith(`${unpackedDist}${path.sep}`)) {
    throw new Error(`Unsafe unpacked release path: ${target}`);
  }
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
    throw new Error(`Symlink in unpacked release: ${target}`);
  }
  fs.mkdirSync(target, { recursive: true });
  const sourceNames = new Set();
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isFile()) throw new Error(`Unsupported release entry: ${entry.name}`);
    sourceNames.add(entry.name);
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      if (fs.existsSync(to) && !fs.lstatSync(to).isDirectory()) fs.rmSync(to, { force: true });
      syncReleaseDirectory(from, to);
    } else if (!sameBytes(from, to)) {
      fs.copyFileSync(from, to);
    }
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    // Preserve the developer's independent addon output without copying it into
    // .release-dist or the OPK (which was already archived above).
    if (target === unpackedDist && entry.name === "addon-prototype") continue;
    if (!sourceNames.has(entry.name)) {
      const stale = path.resolve(target, entry.name);
      if (!stale.startsWith(`${unpackedDist}${path.sep}`) || entry.isSymbolicLink()) {
        throw new Error(`Unsafe stale release path: ${stale}`);
      }
      fs.rmSync(stale, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  }
};
syncReleaseDirectory(dist, unpackedDist);
const unpackedManifest = JSON.parse(fs.readFileSync(path.join(unpackedDist, "manifest.json"), "utf8"));
if (unpackedManifest.meta.version !== manifest.meta.version) throw new Error("Unpacked release version differs from the OPK.");
console.log(`Updated ${unpackedDist} to ${manifest.meta.version}.`);
const packageSizeMb = (fs.statSync(opkPath).size / (1024 * 1024)).toFixed(1);
console.log(`Created ${opkPath} (${packageSizeMb} MB).`);
