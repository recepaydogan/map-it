import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: npm run bump-version -- <patch|minor|major|x.y.z> [--dry-run]";
const args = process.argv.slice(2);
// npm consumes --dry-run as its own config flag on some versions, exposing it
// through the environment instead of forwarding it to the script.
const dryRun = args.includes("--dry-run") || process.env.npm_config_dry_run === "true";
const positional = args.filter((argument) => !argument.startsWith("--"));
const unknownFlags = args.filter((argument) => argument.startsWith("--") && argument !== "--dry-run");

if (unknownFlags.length > 0 || positional.length !== 1) {
  console.error(usage);
  process.exit(1);
}

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const parseVersion = (version) => {
  const match = versionPattern.exec(version);
  if (!match) throw new Error(`Invalid semantic version: ${version}`);
  return match.slice(1).map(Number);
};

const compareVersions = (left, right) => {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
};

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const paths = {
  package: resolve(projectRoot, "package.json"),
  lock: resolve(projectRoot, "package-lock.json"),
  manifest: resolve(projectRoot, "public", "manifest.json"),
};

const originals = new Map(
  Object.values(paths).map((path) => [path, readFileSync(path, "utf8")]),
);
const packageJson = JSON.parse(originals.get(paths.package));
const packageLock = JSON.parse(originals.get(paths.lock));
const manifest = JSON.parse(originals.get(paths.manifest));

if (!packageLock.packages?.[""] || !manifest.meta) {
  throw new Error("Expected package-lock.json root package and public/manifest.json meta.");
}

const current = parseVersion(packageJson.version);
const request = positional[0];
let next;

if (request === "patch") next = [current[0], current[1], current[2] + 1];
else if (request === "minor") next = [current[0], current[1] + 1, 0];
else if (request === "major") next = [current[0] + 1, 0, 0];
else next = parseVersion(request);

if (compareVersions(next, current) <= 0) {
  throw new Error(`New version must be greater than ${packageJson.version}.`);
}

const nextVersion = next.join(".");
const trackedVersions = [
  ["package-lock.json", packageLock.version],
  ["package-lock.json root package", packageLock.packages[""].version],
  ["public/manifest.json", manifest.meta.version],
];

trackedVersions.forEach(([label, version]) => {
  if (version !== packageJson.version) {
    console.warn(`Version drift: ${label} is ${version}; using package.json ${packageJson.version} as the source.`);
  }
});

packageJson.version = nextVersion;
packageLock.version = nextVersion;
packageLock.packages[""].version = nextVersion;
manifest.meta.version = nextVersion;

const outputs = new Map([
  [paths.package, `${JSON.stringify(packageJson, null, 2)}\n`],
  [paths.lock, `${JSON.stringify(packageLock, null, 2)}\n`],
  [paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`],
]);

// Validate the exact serialized output even during a dry run. This catches
// accidental non-JSON suffixes before any version file can be overwritten.
outputs.forEach((content) => JSON.parse(content));

if (dryRun) {
  console.log(`Version ${current.join(".")} -> ${nextVersion} (dry run)`);
  process.exit(0);
}

const written = [];
try {
  outputs.forEach((content, path) => {
    writeFileSync(path, content);
    written.push(path);
  });
} catch (error) {
  written.forEach((path) => writeFileSync(path, originals.get(path)));
  throw error;
}

console.log(`Version ${current.join(".")} -> ${nextVersion}`);
