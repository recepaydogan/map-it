/** Publish the 25 locale files approved by the November 16 CDN audit. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CopyObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { loadEnv } from "vite";
import { releaseContentBaseUrl, verifyReleaseContent } from "./upload-release-content.mjs";

const root = path.resolve(import.meta.dirname, "..");
const mode = process.argv[2];
if (process.argv.length !== 3 || !["--dry-run", "--upload"].includes(mode)) {
  throw new Error("Use --dry-run or --upload.");
}
const env = loadEnv("production", root, "");
const origin = new URL(env.R2_PUBLIC_ORIGIN).origin;
const channelKey = "locales/wow-forever/current.json";
const channelUrl = `${origin}/${channelKey}`;
const languages = ["en", "de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const fetchJson = async url => {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`CDN HTTP ${response.status}: ${url}`);
  return response.json();
};
const baselineChannel = await fetchJson(channelUrl);
if (baselineChannel.version !== 1 || !/^[a-f0-9]{24}$/.test(baselineChannel.fingerprint ?? "")) {
  throw new Error("Invalid locale channel.");
}
const baselineUrl = releaseContentBaseUrl(origin, baselineChannel.fingerprint);
const baseline = await fetchJson(`${baselineUrl}/release-manifest.json`);
if (baseline.fingerprint !== baselineChannel.fingerprint || !Array.isArray(baseline.files)
  || new Set(baseline.files.map(file => file.path)).size !== baseline.files.length
  || baseline.files.some(file => !/^data\/(?:locales\/(?:wow-forever|app)|classes\/(?:guides\/)?locales|guides\/locales|spells\/writeups\/locales)\/[a-zA-Z0-9/_-]+\.json$/.test(file.path)
    || !Number.isInteger(file.size) || file.size <= 0 || !/^[a-f0-9]{64}$/.test(file.sha256 ?? ""))) {
  throw new Error("Unsafe or inconsistent locale manifest.");
}

const auditPath = path.join(root, "data/site-research/cdn-audit-2026-11-16");
const audit = JSON.parse(await readFile(path.join(auditPath, "report.json"), "utf8"));
assert.equal(baselineUrl, audit.bases.locale, "CDN channel advanced after the audit");
const candidates = audit.classification.publicationCandidates;
assert.equal(candidates.length, 25);
assert.equal(new Set(candidates).size, 25);
const replacements = new Map();
const allowedUiPaths = new Set(["settings/minimapOpacity", "settings/minimapOpacityDesc",
  "support/copyMessage", "support/messageCopied", "support/copyMessageFailed",
  "updates/releases/v450", "updates/releases/v451"]);
function verifyUiDelta(before, after, at = "") {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  if (allowedUiPaths.has(at)) return;
  assert.ok(before && after && typeof before === "object" && typeof after === "object", `Unreviewed UI delta: ${at}`);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    verifyUiDelta(before[key], after[key], at ? `${at}/${key}` : key);
  }
}
for (const filename of candidates) {
  assert.ok(/^data\/(?:locales\/app\/[a-zA-Z-]+|guides\/locales\/[a-zA-Z-]+\/(?:making-money|professions))\.json$/.test(filename), filename);
  const entry = baseline.files.find(file => file.path === filename);
  assert.ok(entry, `Missing baseline: ${filename}`);
  const prior = await readFile(path.join(auditPath, "remote", filename));
  assert.equal(sha(prior), entry.sha256, `Audited baseline changed: ${filename}`);
  const localPath = filename.startsWith("data/locales/app/")
    ? path.join(root, "src/i18n/locales", path.basename(filename)) : path.join(root, "public", filename);
  const local = JSON.parse(await readFile(localPath, "utf8"));
  if (filename.startsWith("data/locales/app/")) {
    delete local.mapAddonPrototype;
    verifyUiDelta(JSON.parse(prior), local);
  } else {
    assert.ok(local.intro?.trim() && local.html?.trim() && local.headings?.length >= 3, filename);
    if (filename.endsWith("making-money.json")) {
      assert.ok(local.headings.some(h => h.id === "level-60-weekly-quest"));
      assert.ok(local.html.includes('id="level-60-weekly-quest"'));
    }
  }
  const bytes = Buffer.from(JSON.stringify(local));
  if (sha(bytes) !== entry.sha256) replacements.set(filename, bytes);
}
assert.equal(replacements.size, 25, "Expected exactly the 25 reviewed files");
const files = baseline.files.map(file => {
  const bytes = replacements.get(file.path);
  return bytes ? { path: file.path, size: bytes.length, sha256: sha(bytes) } : file;
}).sort((a, b) => a.path.localeCompare(b.path));
const fingerprintHash = createHash("sha256");
for (const file of files) fingerprintHash.update(`${file.path}\0${file.size}\0${file.sha256}\n`);
const plan = { files, fingerprint: fingerprintHash.digest("hex").slice(0, 24) };
const baseUrl = releaseContentBaseUrl(origin, plan.fingerprint);
const receipt = { baseline: baselineUrl, url: baseUrl, fingerprint: plan.fingerprint,
  changedFiles: [...replacements.keys()], changedKeys: [...allowedUiPaths, "localized guide articles"],
  preservedFiles: files.length - replacements.size, totalFiles: files.length };
console.log(JSON.stringify(receipt, null, 2));
if (mode === "--dry-run") process.exit(0);

for (const key of ["R2_BUCKET", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) {
  if (!env[key]?.trim()) throw new Error(`${key} is required`);
}
const endpoint = env.R2_ENDPOINT?.trim() || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
if (new URL(endpoint).protocol !== "https:") throw new Error("R2 endpoint must use HTTPS.");
const client = new S3Client({ region: "auto", endpoint,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED" });
const prefix = `releases/${plan.fingerprint}`;
try {
  // Capture the authoritative channel ETag so a concurrent publisher cannot be overwritten.
  const currentObject = await client.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: channelKey }));
  assert.deepEqual(JSON.parse(await currentObject.Body.transformToString()), baselineChannel,
    "Locale channel changed during preparation; rerun against the new snapshot.");
  const channelEtag = currentObject.ETag;
  assert.ok(channelEtag, "Missing locale channel ETag");
  let next = 0, completed = 0;
  const worker = async () => {
    while (next < files.length) {
      const file = files[next++];
      const bytes = replacements.get(file.path);
      if (bytes) await client.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: `${prefix}/${file.path}`,
        Body: bytes, ContentLength: bytes.length, ContentType: "application/json; charset=utf-8",
        CacheControl: "public, max-age=31536000, immutable", Metadata: { sha256: file.sha256 } }));
      else await client.send(new CopyObjectCommand({ Bucket: env.R2_BUCKET, Key: `${prefix}/${file.path}`,
        CopySource: `${env.R2_BUCKET}/releases/${baselineChannel.fingerprint}/${file.path}`,
        MetadataDirective: "COPY" }));
      if (++completed % 100 === 0 || completed === files.length) console.log(`Locale snapshot: ${completed}/${files.length}`);
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
  const uploaded = new Map();
  let token;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: `${prefix}/`, ContinuationToken: token }));
    for (const object of page.Contents ?? []) uploaded.set(object.Key, object.Size);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  for (const file of files) assert.equal(uploaded.get(`${prefix}/${file.path}`), file.size, `Upload size mismatch: ${file.path}`);
  await client.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: `${prefix}/release-manifest.json`,
    Body: JSON.stringify({ version: 1, ...plan }), ContentType: "application/json; charset=utf-8",
    CacheControl: "public, max-age=31536000, immutable" }));
  await verifyReleaseContent(plan, origin);
  for (const [filename, expectedBytes] of replacements) {
    const response = await fetch(`${baseUrl}/${filename}`, { headers: { Origin: "http://127.0.0.1" }, signal: AbortSignal.timeout(30_000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(response.ok && response.headers.get("access-control-allow-origin") === "*", `Locale CORS/HTTP failed: ${filename}`);
    assert.equal(sha(bytes), sha(expectedBytes), `CDN hash mismatch: ${filename}`);
  }
  // Conditional publication leaves the old channel active if another publisher moved it.
  await client.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: channelKey,
    IfMatch: channelEtag, Body: JSON.stringify({ version: 1, fingerprint: plan.fingerprint }),
    ContentType: "application/json; charset=utf-8", CacheControl: "no-store" }));
  const active = await fetchJson(`${channelUrl}?verify=${Date.now()}`);
  assert.equal(active.fingerprint, plan.fingerprint, "Published locale channel did not verify");
  const receiptDirectory = path.join(auditPath, "published");
  await mkdir(receiptDirectory, { recursive: true });
  await writeFile(path.join(receiptDirectory, "cdn-receipt.json"), JSON.stringify({ ...receipt,
    verifiedAt: new Date().toISOString(), channelUrl }, null, 2));
  const configPath = path.join(root, "src/game-config.ts");
  const config = await readFile(configPath, "utf8");
  assert.ok(config.includes(`DEFAULT_LOCALE_CONTENT_BASE_URL = "${baselineUrl}"`));
  await writeFile(configPath, config.replace(`DEFAULT_LOCALE_CONTENT_BASE_URL = "${baselineUrl}"`,
    `DEFAULT_LOCALE_CONTENT_BASE_URL = "${baseUrl}"`));
  console.log(`Verified and activated 25 reviewed locale files: ${baseUrl}`);
} finally { client.destroy(); }
