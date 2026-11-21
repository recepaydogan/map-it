import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export const root = path.resolve(import.meta.dirname, "..");
export const policy = JSON.parse(await readFile(path.join(root, "src/content-delivery.json"), "utf8"));
const bundledPatterns = policy.bundledPatterns.map(pattern => new RegExp(pattern));
export const isRemoteContent = relative => policy.remoteRoots.some(prefix => relative.startsWith(prefix))
  && !bundledPatterns.some(pattern => pattern.test(relative));

export async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(file));
    else if (entry.isFile()) result.push(file);
    else throw new Error(`Unsupported content entry: ${entry.name}`);
  }
  return result;
}
export async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
export async function parallel(items, concurrency, operation) {
  const results = new Array(items.length);
  let index = 0;
  let failure;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length && !failure) {
      const current = index++;
      try { results[current] = await operation(items[current], current); }
      catch (error) { failure ??= error; }
    }
  }));
  if (failure) throw failure;
  return results;
}
export async function createReleaseContentPlan() {
  const publicRoot = path.join(root, "public");
  const entries = (await walk(publicRoot)).map(sourcePath => ({ sourcePath,
    path: path.relative(publicRoot, sourcePath).split(path.sep).join("/") }))
    .filter(file => isRemoteContent(file.path));
  for (const sourcePath of await walk(path.join(root, "src/i18n/locales"))) {
    if (sourcePath.endsWith(".json") && path.basename(sourcePath) !== "en.json") {
      entries.push({ sourcePath, path: `locales/${path.basename(sourcePath)}` });
    }
  }
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const files = await parallel(entries, 16, async file => ({ ...file,
    size: (await stat(file.sourcePath)).size, sha256: await sha256File(file.sourcePath) }));
  const hash = createHash("sha256");
  hash.update(`content-policy:${JSON.stringify(policy)}\n`);
  for (const file of files) hash.update(`${file.path}\0${file.size}\0${file.sha256}\n`);
  return { files, fingerprint: hash.digest("hex").slice(0, 24), totalBytes: files.reduce((sum, file) => sum + file.size, 0) };
}
export const publicManifest = plan => ({ version: 1, fingerprint: plan.fingerprint,
  files: plan.files.map(({ path, size, sha256 }) => ({ path, size, sha256 })) });
export const manifestBytes = plan => Buffer.from(JSON.stringify(publicManifest(plan)));
export const digest = bytes => createHash("sha256").update(bytes).digest("hex");
