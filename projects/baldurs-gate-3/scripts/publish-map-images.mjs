import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseArgs, parseEnv } from "node:util";
import { S3Client, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Dry-run by default. Credentials are used only by this Node script.
const { values } = parseArgs({ options: {
  upload: { type: "boolean", default: false },
  verify: { type: "boolean", default: false },
  bucket: { type: "string" },
  origin: { type: "string" },
} });
const env = { ...parseEnv(fs.readFileSync(".env", "utf8")), ...process.env };
if (!values.bucket || values.bucket !== env.R2_BUCKET) throw new Error("Pass --bucket matching R2_BUCKET explicitly.");
const origin = new URL(values.origin);
if (origin.protocol !== "https:" || origin.pathname !== "/") throw new Error("--origin must be an HTTPS origin without a path.");
const endpoint = new URL(env.R2_ENDPOINT);
if (!endpoint.hostname.endsWith(".r2.cloudflarestorage.com") || endpoint.protocol !== "https:") throw new Error("Expected an R2 S3 endpoint.");
const hash = (bytes, algorithm = "sha256") => createHash(algorithm).update(bytes).digest("hex");
const ids = readRegisteredMapIds(fs.readFileSync("src/features/map/map-registry.ts", "utf8"));
const files = [];
const metadataHashes = {};
for (const id of ids) {
  const directory = `public/maps/${id}`;
  const metadataBytes = fs.readFileSync(`${directory}/metadata.json`);
  metadataHashes[id] = hash(metadataBytes);
  const metadata = JSON.parse(metadataBytes);
  if (metadata.tilePattern !== "tiles/{level}/tile{x}x{y}.webp") throw new Error(`Unsupported tile pattern: ${id}`);
  const width = metadata.tileImageSize?.width ?? metadata.bounds.maxX - metadata.bounds.minX;
  const height = metadata.tileImageSize?.height ?? metadata.bounds.maxY - metadata.bounds.minY;
  const paths = [`${id}/overview.webp`];
  for (const level of metadata.detailLevels) {
    const span = metadata.tileSize * 2 ** level;
    for (let x = 0; x < Math.ceil(width / span); x++) {
      for (let y = 0; y < Math.ceil(height / span); y++) paths.push(`${id}/tiles/${level}/tile${x}x${y}.webp`);
    }
  }
  for (const relative of paths) {
    const bytes = fs.readFileSync(`public/maps/${relative}`);
    if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") throw new Error(`Invalid WebP: ${relative}`);
    files.push({ path: relative, size: bytes.length, sha256: hash(bytes), md5: hash(bytes, "md5") });
  }
}
files.sort((a, b) => a.path.localeCompare(b.path, "en"));
const release = hash(JSON.stringify({ metadataHashes, files })).slice(0, 20);
const prefix = `maps/releases/${release}`;
const manifest = { schemaVersion: 1, release, prefix, maps: ids.length, metadataHashes, files };
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
const reportDirectory = path.resolve("map-sources/cdn");
fs.mkdirSync(reportDirectory, { recursive: true });
writeGeneratedFile(path.join(reportDirectory, `${release}.json`), manifestBytes);
console.log(JSON.stringify({ mode: values.upload ? "upload" : values.verify ? "verify" : "dry-run", bucket: values.bucket, maps: ids.length, files: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0), baseUrl: `${origin.origin}/${prefix}` }));
if (!values.upload && !values.verify) process.exit(0);
const client = new S3Client({ region: "auto", endpoint: endpoint.href, maxAttempts: 5, requestChecksumCalculation: "WHEN_REQUIRED",
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
async function listObjects() {
  const objects = new Map();
  let token;
  do {
    const result = await client.send(new ListObjectsV2Command({ Bucket: values.bucket, Prefix: `${prefix}/`, ContinuationToken: token }));
    for (const object of result.Contents ?? []) objects.set(object.Key, object);
    token = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (token);
  return objects;
}
const matches = (object, file) => object?.Size === file.size && object.ETag?.replaceAll('"', "") === file.md5;
async function pooled(items, operation, concurrency = 32) {
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < items.length) await operation(items[next++]);
  }));
}
if (values.upload) {
  const existing = await listObjects();
  const pending = files.filter((file) => {
    const object = existing.get(`${prefix}/${file.path}`);
    if (object && !matches(object, file)) throw new Error(`Immutable release conflict: ${file.path}`);
    return !object;
  });
  console.log(`Uploading ${pending.length} files; ${files.length - pending.length} verified objects already present.`);
  let completed = 0;
  let lastProgress = Date.now();
  await pooled(pending, async (file) => {
    const bytes = fs.readFileSync(`public/maps/${file.path}`);
    if (hash(bytes) !== file.sha256) throw new Error(`File changed during upload: ${file.path}`);
    await client.send(new PutObjectCommand({ Bucket: values.bucket, Key: `${prefix}/${file.path}`, Body: bytes,
      ContentType: "image/webp", CacheControl: "public, max-age=31536000, immutable",
      ContentMD5: Buffer.from(file.md5, "hex").toString("base64"), Metadata: { sha256: file.sha256 } }));
    completed++;
    if (Date.now() - lastProgress > 15000 || completed === pending.length) {
      lastProgress = Date.now();
      console.log(`Uploaded ${completed}/${pending.length}`);
    }
  });
}
const uploaded = await listObjects();
for (const file of files) if (!matches(uploaded.get(`${prefix}/${file.path}`), file)) throw new Error(`Remote size/checksum mismatch: ${file.path}`);
console.log(`Verified all ${files.length} remote object sizes and MD5 checksums.`);
// Verify the custom domain against one overview and one tile from every map.
const samples = ids.flatMap((id) => [files.find((file) => file.path === `${id}/overview.webp`), files.find((file) => file.path.startsWith(`${id}/tiles/`))]);
await pooled(samples, async (file) => {
  const response = await fetch(`${origin.origin}/${prefix}/${file.path}`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.headers.get("content-type")?.includes("image/webp")) throw new Error(`CDN delivery failed: ${file.path} (${response.status})`);
  if (!response.headers.get("cache-control")?.includes("immutable")) throw new Error(`CDN cache policy missing: ${file.path}`);
  if (hash(Buffer.from(await response.arrayBuffer())) !== file.sha256) throw new Error(`CDN checksum mismatch: ${file.path}`);
});
if (values.upload) await client.send(new PutObjectCommand({ Bucket: values.bucket, Key: `${prefix}/manifest.json`, Body: manifestBytes,
  ContentType: "application/json", CacheControl: "public, max-age=31536000, immutable" }));
const receipt = { release, bucket: values.bucket, baseUrl: `${origin.origin}/${prefix}`, verifiedAt: new Date().toISOString(), files: files.length, cdnSamples: samples.length };
writeGeneratedFile(path.join(reportDirectory, `${release}-verified.json`), JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt));
