import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, relative, resolve, sep } from "node:path";

const DEFAULT_ROOT = resolve("public/map-data/knox-country");
const DEFAULT_BUCKET = "pz-map-tiles";
const DEFAULT_PREFIX = "b42.20.2-r1/knox-country";
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const MUTABLE_JSON_CACHE_CONTROL = "no-cache";

const argumentsByName = new Map(
  process.argv.slice(2).map((argument) => {
    const [name, ...valueParts] = argument.replace(/^--/, "").split("=");
    return [name, valueParts.join("=")];
  }),
);

const root = resolve(argumentsByName.get("root") || DEFAULT_ROOT);
const bucket = argumentsByName.get("bucket") || DEFAULT_BUCKET;
const prefix = (argumentsByName.get("prefix") || DEFAULT_PREFIX).replace(/^\/+|\/+$/g, "");
const concurrency = argumentsByName.get("concurrency") || "20";
const requestedParts = new Set(
  (argumentsByName.get("parts") || "metadata,locales,tiles,icons,navigation")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean),
);

const collectFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : Promise.resolve([path]);
  }));
  return files.flat();
};

const toObjectKey = (file) =>
  `${prefix}/${relative(root, file).split(sep).join("/")}`;

const runWrangler = (manifestPath, contentType, cacheControl) => new Promise((resolvePromise, reject) => {
  const wranglerEntry = resolve("node_modules/wrangler/bin/wrangler.js");
  const child = spawn(process.execPath, [
    wranglerEntry,
    "r2",
    "bulk",
    "put",
    bucket,
    "--remote",
    "--force",
    `--filename=${manifestPath}`,
    `--concurrency=${concurrency}`,
    `--content-type=${contentType}`,
    `--cache-control=${cacheControl}`,
  ], { stdio: "inherit" });

  child.once("error", reject);
  child.once("exit", (code) => {
    if (code === 0) resolvePromise();
    else reject(new Error(`Cloudflare upload exited with code ${code}.`));
  });
});

const temporaryDirectory = await mkdtemp(join(tmpdir(), "pz-map-cdn-"));

try {
  const files = [];
  if (requestedParts.has("metadata")) files.push(join(root, "metadata.json"));
  if (requestedParts.has("locales")) files.push(...await collectFiles(join(root, "locales")));
  if (requestedParts.has("tiles")) files.push(...await collectFiles(join(root, "tiles")));
  if (requestedParts.has("icons")) files.push(...await collectFiles(join(root, "icons")));
  if (requestedParts.has("navigation")) files.push(...await collectFiles(join(root, "navigation")));
  const groups = [
    {
      name: "JSON metadata and locales",
      contentType: "application/json; charset=utf-8",
      cacheControl: MUTABLE_JSON_CACHE_CONTROL,
      files: files.filter((file) => extname(file).toLowerCase() === ".json"),
    },
    {
      name: "PNG map assets",
      contentType: "image/png",
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      files: files.filter((file) => extname(file).toLowerCase() === ".png"),
    },
    {
      name: "Navigation binaries",
      contentType: "application/octet-stream",
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      files: files.filter((file) => [".bin", ".gz"].includes(extname(file).toLowerCase())),
    },
  ];

  for (const [index, group] of groups.entries()) {
    if (group.files.length === 0) continue;
    const manifestPath = join(temporaryDirectory, `upload-${index}.json`);
    const manifest = group.files.map((file) => ({ key: toObjectKey(file), file }));
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    console.log(`Uploading ${group.files.length} files: ${group.name}`);
    await runWrangler(manifestPath, group.contentType, group.cacheControl);
  }

  console.log(`Map data uploaded to r2://${bucket}/${prefix}/`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
