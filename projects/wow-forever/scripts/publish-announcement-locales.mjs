/** Patch selected announcement UI copy onto the currently published locale snapshot. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CopyObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { loadEnv } from "vite";
import { releaseContentBaseUrl, verifyReleaseContent } from "./upload-release-content.mjs";

const root = path.resolve(import.meta.dirname, "..");
const mode = process.argv[2];
const announcementArgument = process.argv[3];
const positionTracker = announcementArgument === "--position-tracker";
const announcementKey = announcementArgument?.startsWith("--announcement=")
  ? announcementArgument.slice("--announcement=".length) : undefined;
if (process.argv.length > 4 || !["--dry-run", "--upload"].includes(mode)
  || (announcementArgument && !positionTracker && !["removeAds", "autoOpen", "liveTracking", "minimapAutoOpen"].includes(announcementKey))) {
  throw new Error("Use --dry-run or --upload, optionally with --announcement=<key> or --position-tracker.");
}
const sections = positionTracker
  ? [["announcements", "trackerBack"], ["positionCard"], ["updates", "positionTracker"], ["updates", "releases", "v500"]]
  : [announcementKey ? ["announcements", announcementKey] : ["announcements"]];
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

const replacements = new Map();
const english = JSON.parse(await readFile(path.join(root, "src/i18n/locales/en.json"), "utf8"));
for (const language of languages) {
  const filename = `data/locales/app/${language}.json`;
  const entry = baseline.files.find(file => file.path === filename);
  if (!entry) throw new Error(`Missing published UI locale: ${language}`);
  const response = await fetch(`${baselineUrl}/${filename}`, { signal: AbortSignal.timeout(30_000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok || bytes.length !== entry.size || sha(bytes) !== entry.sha256) {
    throw new Error(`Baseline hash mismatch: ${filename}`);
  }
  const original = JSON.parse(bytes.toString("utf8"));
  const local = JSON.parse(await readFile(path.join(root, "src/i18n/locales", `${language}.json`), "utf8"));
  const validate = (base, translated, key) => {
    if (typeof base === "string") {
      assert.ok(typeof translated === "string" && translated.trim() && !translated.includes("\ufffd"), `Invalid ${language}.${key}`);
      const tokens = text => (text.match(/{{\s*\w+\s*}}/g) ?? []).sort();
      assert.deepEqual(tokens(translated), tokens(base), `Invalid placeholders: ${language}.${key}`);
      return;
    }
    assert.ok(translated && typeof translated === "object", `Missing ${language}.${key}`);
    assert.deepEqual(Object.keys(translated).sort(), Object.keys(base).sort(), `Invalid keys: ${language}.${key}`);
    for (const [child, value] of Object.entries(base)) validate(value, translated[child], `${key}.${child}`);
  };
  const patched = structuredClone(original);
  for (const section of sections) {
    const selected = section.reduce((value, key) => value?.[key], local);
    const expected = section.reduce((value, key) => value?.[key], english);
    validate(expected, selected, section.join("."));
    if (positionTracker && section.at(-1) === "v500") {
      const previous = original.updates?.releases?.v500;
      for (const release of [previous, selected].filter(Boolean)) {
        assert.ok(release.version === "5.0.0" && release.items.length === 1 &&
          release.items[0].target === "position-tracker", `Unexpected 5.0.0 notes: ${language}`);
      }
    }
    const parent = section.slice(0, -1).reduce((value, key) => (value[key] ??= {}), patched);
    parent[section.at(-1)] = selected;
  }
  if (JSON.stringify(original) !== JSON.stringify(patched)) {
    replacements.set(filename, Buffer.from(JSON.stringify(patched)));
  }
}
if (!replacements.size) { console.log("All selected translations are already published."); process.exit(0); }
const files = baseline.files.map(file => {
  const bytes = replacements.get(file.path);
  return bytes ? { path: file.path, size: bytes.length, sha256: sha(bytes) } : file;
}).sort((a, b) => a.path.localeCompare(b.path));
const fingerprintHash = createHash("sha256");
for (const file of files) fingerprintHash.update(`${file.path}\0${file.size}\0${file.sha256}\n`);
const plan = { files, fingerprint: fingerprintHash.digest("hex").slice(0, 24) };
const baseUrl = releaseContentBaseUrl(origin, plan.fingerprint);
const receipt = { baseline: baselineUrl, url: baseUrl, fingerprint: plan.fingerprint,
  changedFiles: [...replacements.keys()], changedKeys: sections.map(section => section.join(".")),
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
  const receiptDirectory = path.join(root, "scratch", positionTracker ? "position-tracker-locale-release" : "announcement-locale-release");
  await mkdir(receiptDirectory, { recursive: true });
  await writeFile(path.join(receiptDirectory, "cdn-receipt.json"), JSON.stringify({ ...receipt,
    verifiedAt: new Date().toISOString(), channelUrl }, null, 2));
  console.log(`Announcement translations active: ${baseUrl}`);
} finally { client.destroy(); }
