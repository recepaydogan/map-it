/** Publish a local build without replacing native DLLs held by Overwolf. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const source = path.resolve(root, process.argv[2] ?? ".dev-build");
const target = path.join(root, "dist");
if (!source.startsWith(root + path.sep) || source === target || source.startsWith(target + path.sep)) throw new Error("Build source must be a separate directory in the workspace.");
await fs.access(path.join(source, "index.html"));
const files = [];
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile()) files.push(path.relative(source, file));
  }
}
await walk(source);
const hash = async file => createHash("sha256").update(await fs.readFile(file)).digest("hex");
const exists = async file => fs.stat(file).catch(error => { if (error.code === "ENOENT") return null; throw error; });
const native = new Set();
// Validate all collisions before changing any app files.
for (const relative of files.filter(file => file.endsWith(".dll"))) {
  const destination = path.join(target, relative);
  if (await exists(destination)) {
    if (await hash(destination) !== await hash(path.join(source, relative))) throw new Error(`A loaded native filename must never be replaced: ${relative}`);
    native.add(relative);
  }
}
let copied = 0, unchanged = 0;
async function copy(relative) {
  const input = path.join(source, relative), output = path.join(target, relative);
  if (native.has(relative)) { unchanged++; return; }
  const before = await exists(output), inputStat = await fs.stat(input);
  if (before?.size === inputStat.size && await hash(input) === await hash(output)) { unchanged++; return; }
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.copyFile(input, output);
  if (await hash(input) !== await hash(output)) throw new Error(`Build copy verification failed: ${relative}`);
  copied++;
}
const entryPoints = files.filter(file => file === "manifest.json" || file.endsWith(".html"));
const assets = files.filter(file => !entryPoints.includes(file));
let next = 0;
await Promise.all(Array.from({ length: 12 }, async () => { while (next < assets.length) await copy(assets[next++]); }));
for (const file of entryPoints.sort((a, b) => (a === "index.html") - (b === "index.html"))) await copy(file);
let removedCdnFiles = 0;
let removedStaleAssets = 0;
const contentRelease = await fs.readFile(path.join(source, "content-release.json"), "utf8").then(JSON.parse).catch(() => null);
if (contentRelease?.baseUrl) {
  const { walk, isRemoteContent } = await import("./release-content.mjs");
  for (const file of await walk(target)) {
    const resolved = path.resolve(file);
    if (!resolved.startsWith(target + path.sep)) throw new Error("Content cleanup must stay inside dist.");
    const relative = path.relative(target, file).split(path.sep).join("/");
    if (isRemoteContent(relative)) { await fs.unlink(file); removedCdnFiles++; }
  }
  // Old hashed bundles can still contain eagerly bundled translations. Keep
  // only assets emitted by this verified lean build; native DLLs stay intact.
  const assetsDirectory = path.resolve(target, "assets");
  if (!assetsDirectory.startsWith(target + path.sep)) throw new Error("Asset cleanup must stay inside dist.");
  for (const file of await walk(assetsDirectory)) {
    const resolved = path.resolve(file);
    if (!resolved.startsWith(assetsDirectory + path.sep)) throw new Error("Unexpected generated asset path.");
    const relative = path.relative(target, file);
    if (!(await exists(path.join(source, relative)))) { await fs.unlink(file); removedStaleAssets++; }
  }
}
console.log(JSON.stringify({ status: "passed", source, target, copied, unchanged, removedCdnFiles, removedStaleAssets, preservedNative: [...native] }));
