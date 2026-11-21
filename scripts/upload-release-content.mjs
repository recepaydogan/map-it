import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { S3Client, ListObjectsV2Command, HeadObjectCommand, PutObjectCommand, CopyObjectCommand,
  GetBucketCorsCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { root, parallel, digest, manifestBytes, publicManifest } from "./release-content.mjs";

const MIME = { ".json": "application/json; charset=utf-8", ".jsonl": "application/x-ndjson; charset=utf-8",
  ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".bin": "application/octet-stream" };
const CACHE = "public, max-age=31536000, immutable";
const mime = file => MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
const encoded = value => value.split("/").map(encodeURIComponent).join("/");
const missing = error => error?.$metadata?.httpStatusCode === 404 || ["NotFound", "NoSuchKey"].includes(error?.name);
export function releaseContentBaseUrl(origin, fingerprint) {
  if (!origin) throw new Error("R2_PUBLIC_ORIGIN is missing.");
  const value = origin.trim();
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) throw new Error("R2_PUBLIC_ORIGIN must be an HTTPS origin without a path.");
  return `${url.origin}/releases/${fingerprint}`;
}
async function listObjects(client, bucket, prefix) {
  const objects = new Map(); let token;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix + "/", ContinuationToken: token }));
    for (const item of page.Contents ?? []) objects.set(item.Key, item.Size);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return objects;
}
async function ensureCors(client, bucket) {
  let rules = [];
  try { rules = (await client.send(new GetBucketCorsCommand({ Bucket: bucket }))).CORSRules ?? []; }
  catch (error) {
    if (error.name === "AccessDenied" || error?.$metadata?.httpStatusCode === 403) {
      console.log("R2 key cannot manage bucket CORS; existing public CORS will be verified.");
      return;
    }
    if (!missing(error) && error.name !== "NoSuchCORSConfiguration") throw new Error(`Cannot read R2 CORS policy (${error.name}).`);
  }
  if (rules.some(rule => rule.AllowedOrigins?.includes("*") && ["GET", "HEAD"].every(method => rule.AllowedMethods?.includes(method)))) return;
  rules.push({ ID: "phantom-blade-public-content", AllowedOrigins: ["*"], AllowedMethods: ["GET", "HEAD"],
    AllowedHeaders: ["*"], ExposeHeaders: ["ETag", "Content-Type", "Cache-Control"], MaxAgeSeconds: 3600 });
  await client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: rules } }));
}
async function previousRelease(origin) {
  try {
    const pinned = JSON.parse(await readFile(path.join(root, "content-release.json"), "utf8"));
    if (!pinned.fingerprint || pinned.baseUrl !== releaseContentBaseUrl(origin, pinned.fingerprint)) return null;
    const response = await fetch(`${pinned.baseUrl}/release-manifest.json`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== pinned.manifestSha256) return null;
    const manifest = JSON.parse(bytes);
    return { prefix: `releases/${pinned.fingerprint}`, files: new Map(manifest.files.map(file => [file.path, file])) };
  } catch { return null; }
}
async function retry(operation) {
  for (let attempt = 1; ; attempt++) {
    try { return await operation(); } catch (error) {
      if (attempt >= 4 || (error?.$metadata?.httpStatusCode < 500 && !["XAmzContentSHA256Mismatch", "SlowDown", "TimeoutError", "RequestTimeout"].includes(error.name))) throw error;
      await new Promise(resolve => setTimeout(resolve, 300 * attempt));
    }
  }
}
function verificationSamples(plan) {
  const selected = new Map();
  const add = file => { if (file && file.size <= 32 * 1024 * 1024) selected.set(file.path, file); };
  const groups = new Set();
  for (const file of plan.files) {
    const group = file.path.split("/").slice(0, 3).join("/");
    if (!groups.has(group)) { groups.add(group); add(file); }
    if (file.path.startsWith("locales/") || file.path.startsWith("data/locales/")
      || /\/metadata\.json$|\/locations(?:-game-files|-quests)?\.json$/.test(file.path)
      || file.path.startsWith("maps/category-icons/")) add(file);
  }
  for (let index = 0; index < 32; index++) add(plan.files[Math.floor(index * (plan.files.length - 1) / 31)]);
  return [...selected.values()];
}
async function verifyPublic(baseUrl, files) {
  const results = await parallel(files, 12, async file => {
    const response = await fetch(`${baseUrl}/${encoded(file.path)}`, {
      headers: { Origin: "http://localhost:5173" }, signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`CDN verification failed: ${file.path} HTTP ${response.status}.`);
    const body = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "";
    const cache = response.headers.get("cache-control") ?? "";
    const cors = response.headers.get("access-control-allow-origin");
    if (body.length !== file.size || digest(body) !== file.sha256) throw new Error(`CDN checksum mismatch: ${file.path}`);
    if (!contentType.toLowerCase().startsWith(mime(file.path).split(";")[0])) throw new Error(`CDN MIME mismatch: ${file.path}`);
    if (!cache.includes("immutable") || !cache.includes("31536000")) throw new Error(`CDN immutable cache missing: ${file.path}`);
    if (cors !== "*" && cors !== "http://localhost:5173") throw new Error(`CDN CORS missing: ${file.path}`);
    return { path: file.path, size: body.length, sha256: file.sha256, contentType, cache, cors };
  });
  return results;
}
export async function uploadReleaseContent(plan, env) {
  const required = ["R2_BUCKET", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PUBLIC_ORIGIN"];
  for (const key of required) if (!env[key]?.trim()) throw new Error(`${key} is missing.`);
  const bucket = env.R2_BUCKET.trim();
  const baseUrl = releaseContentBaseUrl(env.R2_PUBLIC_ORIGIN, plan.fingerprint);
  const endpoint = env.R2_ENDPOINT?.trim() || `https://${env.R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com`;
  if (new URL(endpoint).protocol !== "https:") throw new Error("R2_ENDPOINT must use HTTPS.");
  const client = new S3Client({ region: "auto", endpoint, credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID.trim(), secretAccessKey: env.R2_SECRET_ACCESS_KEY.trim(),
  }, requestChecksumCalculation: "WHEN_REQUIRED", maxAttempts: 4 });
  const prefix = `releases/${plan.fingerprint}`;
  const concurrency = Math.min(48, Math.max(1, Number(env.R2_UPLOAD_CONCURRENCY) || 24));
  const counts = { uploaded: 0, copied: 0, resumed: 0 }; let completed = 0;
  try {
    await ensureCors(client, bucket);
    const previous = await previousRelease(env.R2_PUBLIC_ORIGIN);
    const existing = await listObjects(client, bucket, prefix);
    console.log(`R2: ${plan.files.length} files, ${(plan.totalBytes / 1048576).toFixed(1)} MiB, ${concurrency} workers.`);
    await parallel(plan.files, concurrency, async file => {
      const key = `${prefix}/${file.path}`;
      if (existing.has(key)) {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        if (head.ContentLength !== file.size || head.Metadata?.sha256 !== file.sha256) throw new Error(`Immutable object differs: ${file.path}`);
        counts.resumed++;
      } else if (previous?.files.get(file.path)?.sha256 === file.sha256 && previous.files.get(file.path).size === file.size) {
        await retry(() => client.send(new CopyObjectCommand({ Bucket: bucket, Key: key,
          CopySource: encoded(`${bucket}/${previous.prefix}/${file.path}`), MetadataDirective: "COPY" })));
        counts.copied++;
      } else {
        const body = await readFile(file.sourcePath);
        if (body.length !== file.size || digest(body) !== file.sha256) throw new Error(`Source changed during upload: ${file.path}`);
        await retry(() => client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentLength: body.length,
          ContentType: mime(file.path), CacheControl: CACHE, Metadata: { sha256: file.sha256 }, IfNoneMatch: "*" })));
        counts.uploaded++;
      }
      completed++;
      if (completed % 250 === 0 || completed === plan.files.length) console.log(`R2 ${completed}/${plan.files.length}: ${counts.uploaded} uploaded, ${counts.copied} copied, ${counts.resumed} resumed.`);
    });
    const all = await listObjects(client, bucket, prefix);
    const incomplete = plan.files.find(file => all.get(`${prefix}/${file.path}`) !== file.size);
    if (incomplete) throw new Error(`R2 inventory is incomplete: ${incomplete.path}`);
    console.log("R2 inventory complete; checking public hashes, MIME, CORS and cache headers.");
    const checked = await verifyPublic(baseUrl, verificationSamples(plan));
    const bytes = manifestBytes(plan);
    const manifestKey = `${prefix}/release-manifest.json`;
    if (all.has(manifestKey)) {
      const response = await fetch(`${baseUrl}/release-manifest.json`, { signal: AbortSignal.timeout(30000) });
      if (!response.ok || digest(Buffer.from(await response.arrayBuffer())) !== digest(bytes)) throw new Error("Existing immutable manifest differs.");
    } else {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: manifestKey, Body: bytes,
        ContentType: MIME['.json'], CacheControl: CACHE, Metadata: { sha256: digest(bytes) }, IfNoneMatch: "*" }));
    }
    await verifyPublic(baseUrl, [{ path: "release-manifest.json", size: bytes.length, sha256: digest(bytes) }]);
    const receipt = { status: "verified", version: 1, fingerprint: plan.fingerprint, baseUrl,
      manifestSha256: digest(bytes), fileCount: plan.files.length, contentBytes: plan.totalBytes,
      inventoryVerified: plan.files.length, publicHashChecks: checked.length + 1, ...counts, checked,
      manifest: publicManifest(plan), publishedAt: new Date().toISOString() };
    await mkdir(path.join(root, "artifacts"), { recursive: true });
    await writeFile(path.join(root, "artifacts", `content-release-${plan.fingerprint}.json`), JSON.stringify(receipt, null, 2) + "\n");
    console.log(`Public CDN verified: ${receipt.publicHashChecks} checksum/MIME/CORS/cache checks.`);
    return receipt;
  } finally { client.destroy(); }
}
