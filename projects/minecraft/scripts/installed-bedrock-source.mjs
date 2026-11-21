import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const packagePattern = /^Microsoft\.MinecraftUWP_([0-9.]+)_x64__8wekyb3d8bbwe$/;
const packPattern = /^vanilla_(\d+(?:\.\d+){1,3})$/;
const runFile = promisify(execFile);
const versionParts = value => value.split(".").map(part => Number(part));
const compareVersions = (left, right) => {
  const a = versionParts(left), b = versionParts(right), length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
};

const findDataRoot = async () => {
  const configured = process.env.MINECRAFT_BEDROCK_DATA_DIR?.trim();
  if (configured) {
    const root = resolve(configured); await stat(join(root, "behavior_packs"));
    return { root, packageVersion: process.env.MINECRAFT_BEDROCK_PACKAGE_VERSION?.trim() || "local" };
  }
  if (process.platform !== "win32") throw new Error("Set MINECRAFT_BEDROCK_DATA_DIR to the installed Bedrock data directory.");
  const windowsApps = join(process.env.ProgramFiles || "C:\\Program Files", "WindowsApps");
  let entries;
  try { entries = await readdir(windowsApps, { withFileTypes: true }); }
  catch (error) {
    if (error.code !== "EPERM" && error.code !== "EACCES") throw error;
    const result = await runFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "(Get-AppxPackage -Name Microsoft.MinecraftUWP | Sort-Object Version -Descending | Select-Object -First 1).InstallLocation"],
    { windowsHide: true, timeout: 10000 });
    const install = resolve(result.stdout.trim()), name = install.split(/[\\/]/).pop(), match = packagePattern.exec(name);
    const relativeInstall = relative(resolve(windowsApps), install);
    if (!match || !relativeInstall || relativeInstall === ".." || relativeInstall.startsWith(`..${sep}`) || isAbsolute(relativeInstall))
      throw new Error("Minecraft for Windows returned an invalid install location.");
    return { root: join(install, "data"), packageVersion: match[1] };
  }
  const packages = entries.flatMap(entry => {
    const match = entry.isDirectory() ? packagePattern.exec(entry.name) : null;
    return match ? [{ name: entry.name, version: match[1] }] : [];
  }).sort((left, right) => compareVersions(right.version, left.version));
  if (!packages[0]) throw new Error("Minecraft for Windows is not installed.");
  return { root: join(windowsApps, packages[0].name, "data"), packageVersion: packages[0].version };
};

const jsonFiles = async directory => {
  const files = [];
  const visit = async current => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.name === "__brarchive") continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(path);
    }
  };
  try { await visit(directory); } catch (error) { if (error.code !== "ENOENT") throw error; }
  return files;
};

/** Reconstruct the effective vanilla behavior pack by applying Mojang's bundled version layers in release order. */
export const readInstalledBedrockSource = async (source, prefixes) => {
  const { root, packageVersion } = await findDataRoot();
  if (source.packageVersion !== packageVersion) throw new Error(`Installed Bedrock package ${packageVersion} does not match pinned ${source.packageVersion}.`);
  const behaviorPacks = join(root, "behavior_packs"), entries = await readdir(behaviorPacks, { withFileTypes: true });
  const layers = entries.flatMap(entry => {
    if (!entry.isDirectory()) return [];
    if (entry.name === "vanilla") return [{ name: entry.name, version: "0.0.0" }];
    const match = packPattern.exec(entry.name);
    return match && compareVersions(match[1], source.targetPackVersion) <= 0 ? [{ name: entry.name, version: match[1] }] : [];
  }).sort((left, right) => compareVersions(left.version, right.version));
  if (!layers.length || layers[0].name !== "vanilla") throw new Error("Installed Bedrock vanilla behavior pack is missing.");
  const wanted = prefixes.map(prefix => prefix.replace(/^behavior_pack\//, "").replace(/\/+$/, ""));
  const effective = new Map();
  for (const layer of layers) {
    const layerRoot = join(behaviorPacks, layer.name);
    for (const prefix of wanted) for (const path of await jsonFiles(join(layerRoot, ...prefix.split("/")))) {
      const logical = relative(layerRoot, path).split(sep).join("/");
      effective.set(logical, path);
    }
  }
  if (!effective.size || effective.size > 10000) throw new Error("Installed Bedrock source has an invalid file count.");
  const files = [];
  let total = 0;
  for (const [logical, path] of [...effective].sort(([left], [right]) => left.localeCompare(right, "en"))) {
    const bytes = await readFile(path); total += bytes.length;
    if (!bytes.length || bytes.length > 1024 * 1024 || total > 64 * 1024 * 1024) throw new Error("Installed Bedrock JSON exceeds extraction limits.");
    files.push({ path: `behavior_pack/${logical}`, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  return { archiveSha256: createHash("sha256").update(files.map(file => `${file.path}:${file.sha256}`).join("\n")).digest("hex"), files,
    packageVersion, layers: layers.map(layer => layer.name) };
};
