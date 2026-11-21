import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const contentDirectories = ["data", "maps"];

async function collectFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
    else throw new Error(`Unsupported release content entry: ${entryPath}`);
  }
  return files;
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export async function createReleaseContentPlan(root) {
  const paths = (await Promise.all(contentDirectories.map((name) => collectFiles(path.join(root, name)))))
    .flat()
    .sort();
  if (paths.length === 0) throw new Error("Release content is empty.");

  const fingerprintHash = createHash("sha256");
  const files = [];
  for (const sourcePath of paths) {
    const relativePath = path.relative(root, sourcePath).split(path.sep).join("/");
    const size = (await stat(sourcePath)).size;
    const sha256 = await hashFile(sourcePath);
    files.push({ path: relativePath, sourcePath, size, sha256 });
    fingerprintHash.update(`${relativePath}\0${size}\0${sha256}\n`);
  }
  return { files, fingerprint: fingerprintHash.digest("hex").slice(0, 24) };
}
