import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, ".release-dist");
const manifestValidator = path.join(root, "scripts", "validate-manifest.mjs");

// Fail before the expensive build if the source manifest is already invalid.
execFileSync(process.execPath, [manifestValidator], { cwd: root, stdio: "inherit" });

// The multi-gigabyte isometric renders are linked into dist for local preview.
// Release builds use the hosted map source and must never traverse those
// junctions while creating the OPK.
process.env.VITE_ISOMETRIC_EXTERNAL_ENABLED = "true";
process.env.VITE_ISOMETRIC_LOCAL_FALLBACK_ENABLED = "false";

// emptyOutDir is disabled in vite.config.ts, so hashed bundles from previous
// builds pile up in dist and would all land in the OPK. Clean dist here;
// prebuild recreates the icons, bridge mod and junction links. The junctions
// are unlinked explicitly first so nothing can ever traverse into the
// multi-gigabyte runtime map data.
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
execSync("npx tsc -b", { cwd: root, stdio: "inherit" });
execSync("npx vite build --outDir .release-dist --emptyOutDir", { cwd: root, stdio: "inherit" });
execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
  path.join(root, "scripts/position-probe/build-native-position.ps1"), "-OutputDirectory", ".release-dist"],
{ cwd: root, stdio: "inherit" });

// The bridge is a Project Zomboid mod payload, not a Vite asset. Ship it in
// the OPK so the app can install the exact bridge version it was built with.
const bridgeDirectoryName = "ProjectZomboidInteractiveMap";
const bridgeSource = path.join(root, "bridge-mod", bridgeDirectoryName);
const bridgeDestination = path.join(dist, "bridge-mod", bridgeDirectoryName);
fs.cpSync(bridgeSource, bridgeDestination, { recursive: true });

const requiredBridgeFiles = [
  "native-position/launcher.jar",
  "native-position/runtime/bin/java.exe",
  "native-position/runtime/bin/attach.dll",
  "native-position/agent-name.txt",
  `bridge-mod/${bridgeDirectoryName}/42/mod.info`,
  `bridge-mod/${bridgeDirectoryName}/common/media/lua/client/PZInteractiveMapBridge.lua`,
];
const nativeAgentName = fs.readFileSync(path.join(dist, "native-position", "agent-name.txt"), "utf8").trim();
if (!/^PositionProbe_[A-F0-9]+\.jar$/.test(nativeAgentName)) throw new Error("Invalid native position agent name");
requiredBridgeFiles.push(`native-position/${nativeAgentName}`);
for (const relativePath of requiredBridgeFiles) {
  if (!fs.existsSync(path.join(dist, ...relativePath.split("/")))) {
    throw new Error(`Release bridge payload is missing ${relativePath}.`);
  }
}

const mapDataRoot = path.join(dist, "map-data", "knox-country");
for (const name of ["tiles", "locales", "icons", "metadata.json"]) {
  const assetPath = path.join(mapDataRoot, name);
  if (fs.existsSync(assetPath)) {
    fs.rmSync(assetPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(dist, "manifest.json"), "utf8"));
execFileSync(process.execPath, [manifestValidator, path.join(dist, "manifest.json")], {
  cwd: root,
  stdio: "inherit",
});

// Schema validation cannot prove that paths declared by the manifest actually
// ship in the OPK. Check every local asset/window/plugin reference in the exact
// release directory before archiving it.
const referencedManifestFiles = new Set([
  manifest.meta.icon,
  manifest.meta.icon_gray,
  manifest.meta.launcher_icon,
  manifest.meta.tray_icon,
  manifest.meta.window_icon,
  manifest.data?.uninstall_window?.file,
  ...Object.values(manifest.data?.windows ?? {}).map((windowConfig) => windowConfig.file),
  ...Object.values(manifest.data?.["extra-objects"] ?? {}).map((extraObject) => extraObject.file),
].filter(Boolean));

for (const relativePath of referencedManifestFiles) {
  if (!fs.existsSync(path.join(dist, ...relativePath.split("/")))) {
    throw new Error(`Manifest references a missing release file: ${relativePath}.`);
  }
}

const fileName = `project-zomboid-interactive-map-${manifest.meta.version}`;
const zipPath = path.join(root, `${fileName}.zip`);
const opkPath = path.join(root, `${fileName}.opk`);

for (const output of [zipPath, opkPath]) {
  if (fs.existsSync(output)) fs.rmSync(output, { force: true });
}

execFileSync("tar", [
  "-a",
  "-c",
  "-f",
  zipPath,
  "--exclude=map-data/knox-country/isometric",
  "--exclude=map-data/knox-country/isometric-optimized",
  "--exclude=map-data/knox-country/isometric-mods",
  "--exclude=map-data/knox-country/tiles",
  "--exclude=map-data/knox-country/locales",
  "--exclude=map-data/knox-country/icons",
  "--exclude=map-data/knox-country/metadata.json",
  "-C",
  dist,
  ...fs.readdirSync(dist),
], {
  cwd: root,
  stdio: "inherit",
});
fs.renameSync(zipPath, opkPath);
const rawArchiveEntries = execFileSync("tar", ["-tf", opkPath], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);
if (!rawArchiveEntries.includes("manifest.json")) {
  throw new Error("OPK must contain manifest.json at the archive root.");
}
if (rawArchiveEntries.some((entry) => entry.startsWith("./"))) {
  throw new Error("OPK contains ./-prefixed entries that Overwolf cannot resolve reliably.");
}
const archiveEntries = new Set(rawArchiveEntries);
for (const relativePath of requiredBridgeFiles) {
  if (!archiveEntries.has(relativePath)) throw new Error(`OPK is missing ${relativePath}.`);
}
const packageSizeMb = (fs.statSync(opkPath).size / (1024 * 1024)).toFixed(1);
console.log(`Created ${opkPath} (${packageSizeMb} MB) with the Project Zomboid bridge payload.`);
