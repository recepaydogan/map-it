import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const version = process.argv[2];

if (process.argv.length !== 3) {
  console.error("Usage: npm run bump-version <version>");
  console.error("Example: npm run bump-version 1.0.0");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version format: "${version}". Expected semver like 1.0.0`);
  process.exit(1);
}

const files = [
  { path: path.join(ROOT, "package.json"), key: ["version"] },
  { path: path.join(ROOT, "package-lock.json"), key: ["version"] },
  { path: path.join(ROOT, "package-lock.json"), key: ["packages", "", "version"] },
  { path: path.join(ROOT, "public", "manifest.json"), key: ["meta", "version"] },
];

const updates = files.map((file) => {
  const relativePath = path.relative(ROOT, file.path);
  if (!fs.existsSync(file.path)) {
    throw new Error(`Required version file is missing: ${relativePath}`);
  }

  const source = fs.readFileSync(file.path, "utf-8");
  const json = JSON.parse(source);
  let target = json;
  for (let index = 0; index < file.key.length - 1; index += 1) {
    target = target?.[file.key[index]];
  }

  const lastKey = file.key[file.key.length - 1];
  if (typeof target?.[lastKey] !== "string") {
    throw new Error(`Missing version field in ${relativePath}: ${file.key.join(".")}`);
  }
  return { ...file, relativePath, source, oldVersion: target[lastKey] };
});

for (const filePath of new Set(updates.map((file) => file.path))) {
  const fileUpdates = updates.filter((file) => file.path === filePath);
  const source = fileUpdates[0].source;
  const json = JSON.parse(source);
  for (const file of fileUpdates) {
    let target = json;
    for (const key of file.key.slice(0, -1)) target = target[key];
    target[file.key.at(-1)] = version;
    console.log(`  ${file.relativePath} ${file.key.join(".")}  ${file.oldVersion} -> ${version}`);
  }

  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const updated = `${JSON.stringify(json, null, 2).replace(/\n/g, newline)}${newline}`;
  if (updated !== source) fs.writeFileSync(filePath, updated);
}

console.log(`\nVersion bumped to ${version}`);
