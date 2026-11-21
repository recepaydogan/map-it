import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Loaded native DLLs allow reads but reject writes, even for identical bytes. */
export const copyBuildPublic = (source: string, destination: string) => {
  if (resolve(source) === resolve(destination)) throw new Error("Public source and build output must differ.");
  const files: string[] = [];
  const collect = (directory: string, relative = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = join(relative, entry.name);
      if (entry.isDirectory()) collect(join(directory, entry.name), name);
      else if (entry.isFile()) files.push(name);
      else throw new Error(`Unsupported public asset: ${name}`);
    }
  };
  collect(source);
  // Publish the manifest only after every referenced native asset is ready.
  files.sort((a, b) => Number(a === "manifest.json") - Number(b === "manifest.json") || a.localeCompare(b));
  let copied = 0;
  let unchanged = 0;
  for (const relative of files) {
    const from = join(source, relative);
    const to = join(destination, relative);
    if (existsSync(to) && statSync(from).size === statSync(to).size && readFileSync(from).equals(readFileSync(to))) {
      unchanged++;
      continue;
    }
    mkdirSync(dirname(to), { recursive: true });
    // A changed, locked file is a real error: never silently ship stale bytes.
    copyFileSync(from, to);
    copied++;
  }
  return { copied, unchanged };
};
