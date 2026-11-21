import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, ".dev-build");
const target = resolve(root, "dist");
if (!source.startsWith(`${root}${sep}`) || !target.startsWith(`${root}${sep}`)
  || !existsSync(join(source, "manifest.json"))) {
  throw new Error("Safe development build is missing or outside the project.");
}

const sameBytes = (left, right) => {
  if (!existsSync(right)) return false;
  const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
  return digest(left) === digest(right);
};

const manifest = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8"));
const relativePlugin = manifest.data["extra-objects"]["enshrouded-position-reader"].file;
const sourcePlugin = resolve(source, relativePlugin);
const targetPlugin = resolve(target, relativePlugin);
if (!sourcePlugin.startsWith(`${source}${sep}`) || !targetPlugin.startsWith(`${target}${sep}`)
  || !existsSync(sourcePlugin)) {
  throw new Error("Built position reader is missing from the development app.");
}

mkdirSync(dirname(targetPlugin), { recursive: true });
if (!sameBytes(sourcePlugin, targetPlugin)) cpSync(sourcePlugin, targetPlugin, { force: true });
const delayedFiles = new Set(["index.html", "background.html", "uninstall.html", "manifest.json"]);
cpSync(source, target, {
  recursive: true,
  force: true,
  filter(file) {
    const path = relative(source, file);
    if (path === relativePlugin || delayedFiles.has(path)) return false;
    if (!file.endsWith(".dll")) return true;
    const destination = join(target, relative(source, file));
    // Overwolf holds a loaded native DLL open. Reuse identical bytes and copy
    // a changed reader under its source-hash filename without touching it.
    return !sameBytes(file, destination);
  },
});
for (const file of delayedFiles) {
  cpSync(join(source, file), join(target, file), { force: true });
}
console.log(`Development build updated in ${target}`);
