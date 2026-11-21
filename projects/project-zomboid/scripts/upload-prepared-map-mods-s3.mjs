import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { createR2Client, loadR2Configuration } from "./r2-s3-client.mjs";

const DEFAULT_ROOT = resolve(".runtime-data/map-data/knox-country/isometric-mods");
const DEFAULT_PREFIX = "b42.20.2-r1/knox-country/isometric-mods-v2";
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const CONTENT_TYPES = new Map([
  [".webp", "image/webp"],
  [".dzi", "application/xml; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".bin", "application/octet-stream"],
  [".gz", "application/octet-stream"],
]);

const argumentsByName = new Map(process.argv.slice(2).map((argument) => {
  const [name, ...valueParts] = argument.replace(/^--/, "").split("=");
  return [name, valueParts.join("=")];
}));
const root = resolve(argumentsByName.get("root") || DEFAULT_ROOT);
const prefix = (argumentsByName.get("prefix") || DEFAULT_PREFIX).replace(/^\/+|\/+$/g, "");
const concurrency = Number.parseInt(argumentsByName.get("concurrency") || "32", 10);
const metadataFileName = argumentsByName.get("metadata") || "catalog.json";
const selectedModKeys = new Set((argumentsByName.get("mods") || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean));
if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Concurrency must be a positive integer.");

const collectFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : Promise.resolve([path]);
  }));
  return nested.flat();
};

const configuration = await loadR2Configuration();
const client = createR2Client(configuration);
const metadataPath = join(root, metadataFileName);
const files = (await collectFiles(root))
  .filter((file) => {
    if (!CONTENT_TYPES.has(extname(file).toLowerCase()) || file === metadataPath) return false;
    if (selectedModKeys.size === 0) return true;
    const modKey = relative(root, file).split(sep)[0];
    return selectedModKeys.has(modKey);
  })
  .sort((left, right) => left.localeCompare(right, "en"));
if (selectedModKeys.size > 0) {
  const foundModKeys = new Set(files.map((file) => relative(root, file).split(sep)[0]));
  const missingModKeys = [...selectedModKeys].filter((modKey) => !foundModKeys.has(modKey));
  if (missingModKeys.length > 0) throw new Error(`Prepared mods were not found: ${missingModKeys.join(", ")}.`);
}
const toKey = (file) => `${prefix}/${relative(root, file).split(sep).join("/")}`;

const remoteSizes = new Map();
// A staged release may contain only new mods; do not scan every published tile.
const remotePrefixes = [...new Set(files.map((file) =>
  `${prefix}/${relative(root, file).split(sep)[0]}/`))];
for (const remotePrefix of remotePrefixes) {
  let continuationToken;
  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: configuration.bucket,
      Prefix: remotePrefix,
      ContinuationToken: continuationToken,
    }));
    for (const object of response.Contents ?? []) remoteSizes.set(object.Key, object.Size);
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
}

let nextIndex = 0;
let checked = 0;
let uploaded = 0;
let skipped = 0;
let uploadedBytes = 0;

const wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

const uploadFile = async (file, cacheControl = IMMUTABLE_CACHE_CONTROL, force = false) => {
  const size = (await stat(file)).size;
  const key = toKey(file);
  if (!force && remoteSizes.get(key) === size) {
    skipped += 1;
    return;
  }
  let lastError;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      await client.send(new PutObjectCommand({
        Bucket: configuration.bucket,
        Key: key,
        Body: createReadStream(file),
        ContentLength: size,
        ContentType: CONTENT_TYPES.get(extname(file).toLowerCase()),
        CacheControl: cacheControl,
      }));
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 8) await wait(Math.min(10000, 400 * 2 ** (attempt - 1)) + Math.random() * 250);
    }
  }
  if (lastError) throw lastError;
  uploaded += 1;
  uploadedBytes += size;
};

const worker = async () => {
  while (nextIndex < files.length) {
    const index = nextIndex++;
    const isJson = extname(files[index]).toLowerCase() === ".json";
    await uploadFile(files[index], isJson ? "no-cache" : IMMUTABLE_CACHE_CONTROL, isJson);
    checked += 1;
    if (checked % 500 === 0 || checked === files.length) {
      console.log(`Checked ${checked}/${files.length}; uploaded ${uploaded}; skipped ${skipped}; ${(uploadedBytes / 1024 / 1024).toFixed(1)} MiB sent.`);
    }
  }
};

try {
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  await uploadFile(metadataPath, "no-cache", true);
  console.log(JSON.stringify({
    bucket: configuration.bucket,
    prefix,
    files: files.length + 1,
    uploaded,
    skipped,
    uploadedMiB: Number((uploadedBytes / 1024 / 1024).toFixed(1)),
  }, null, 2));
} finally {
  client.destroy();
}
