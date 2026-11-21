import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { createR2Client, loadR2Configuration } from "./r2-s3-client.mjs";

const argumentValue = (name, fallback) => process.argv
  .find((argument) => argument.startsWith(`--${name}=`))
  ?.slice(name.length + 3) ?? fallback;
const root = resolve(argumentValue("root", "public/map-data/knox-country/navigation"));
const prefix = argumentValue("prefix", "b42.20.2-r1/knox-country/navigation").replace(/\/$/, "");
const forceUpload = process.argv.includes("--force");
const immutableCacheControl = "public, max-age=31536000, immutable";
const concurrency = 24;
const contentTypes = new Map([
  [".json", "application/json; charset=utf-8"],
  [".bin", "application/octet-stream"],
  [".gz", "application/octet-stream"],
]);

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
const manifestPath = join(root, "manifest.json");
const files = (await collectFiles(root))
  .filter((file) => contentTypes.has(extname(file).toLowerCase()) && file !== manifestPath)
  .sort((left, right) => left.localeCompare(right, "en"));
const toKey = (file) => `${prefix}/${relative(root, file).split(sep).join("/")}`;

const remoteObjects = new Map();
let continuationToken;
do {
  const response = await client.send(new ListObjectsV2Command({
    Bucket: configuration.bucket,
    Prefix: `${prefix}/`,
    ContinuationToken: continuationToken,
  }));
  for (const object of response.Contents ?? []) {
    remoteObjects.set(object.Key, {
      size: object.Size,
      etag: object.ETag?.replaceAll('"', "").toLowerCase(),
    });
  }
  continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
} while (continuationToken);

let nextIndex = 0;
let uploaded = 0;
let skipped = 0;
let uploadedBytes = 0;
const wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

const uploadFile = async (file, force = false) => {
  const size = (await stat(file)).size;
  const key = toKey(file);
  const remote = remoteObjects.get(key);
  if (!force && remote?.size === size && remote.etag) {
    const localEtag = createHash("md5").update(await readFile(file)).digest("hex");
    if (remote.etag === localEtag) {
      skipped += 1;
      return;
    }
  }
  let lastError;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      await client.send(new PutObjectCommand({
        Bucket: configuration.bucket,
        Key: key,
        Body: createReadStream(file),
        ContentLength: size,
        ContentType: contentTypes.get(extname(file).toLowerCase()),
        CacheControl: force ? "no-cache" : immutableCacheControl,
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
    await uploadFile(files[index], forceUpload);
  }
};

try {
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  await uploadFile(manifestPath, true);
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
