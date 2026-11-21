import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1];
};
if (!option("--source-root") || !option("--base-url")) {
  throw new Error("Usage: node scripts/verify-peak-cdn.mjs --source-root <directory> --base-url <url> [--assets-only | --catalog-only]");
}
const sourceRoot = resolve(option("--source-root"));
const baseUrl = option("--base-url").replace(/\/+$/u, "");
const catalogKey = option("--catalog-key") ?? "catalog.json";
if (!["catalog.json", "catalog-v4.json"].includes(catalogKey)) throw new Error("Invalid catalog key");
const assetsOnly = args.includes("--assets-only");
const catalogOnly = args.includes("--catalog-only");
if (assetsOnly && catalogOnly) throw new Error("Choose one verification mode.");
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
const collect = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (entry.isFile() && entry.name !== "map-capture.json") files.push(path);
  }
  return files;
};
const files = (await collect(sourceRoot)).filter((path) => {
  const isCatalog = relative(sourceRoot, path) === "catalog.json";
  return assetsOnly ? !isCatalog : catalogOnly ? isCatalog : true;
});
if (files.length === 0) throw new Error("No files selected for verification.");
let next = 0;
let completed = 0;
const failures = [];
const worker = async () => {
  while (next < files.length) {
    const path = files[next++];
    const localKey = relative(sourceRoot, path).replaceAll("\\", "/");
    const key = localKey === "catalog.json" ? catalogKey : localKey;
    const expected = hash(await readFile(path));
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(`${baseUrl}/${key}${localKey === 'catalog.json' ? `?verify=${Date.now()}` : ''}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(45_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (hash(Buffer.from(await response.arrayBuffer())) !== expected) throw new Error("SHA-256 mismatch");
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) failures.push(`${key}: ${lastError.message}`);
    completed++;
    if (completed % 25 === 0 || completed === files.length) {
      console.log(`Verified ${completed}/${files.length} CDN objects; failures: ${failures.length}`);
    }
  }
};
await Promise.all(Array.from({ length: 4 }, worker));
if (failures.length) throw new Error(`CDN verification failed:\n${failures.join("\n")}`);
console.log(`All ${files.length} CDN objects match local SHA-256 hashes.`);
