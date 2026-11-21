import fs from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { S3Client, ListObjectsV2Command, PutObjectCommand, GetBucketCorsCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { root, cacheRoot, digest, writeJson } from "./prepare-app-content.mjs";
import { PROFILE_ORIGINS, PUBLISH_PROFILES } from "../config/app-content-policy.mjs";

async function envFor(profile) {
  const values = {};
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    try { Object.assign(values, parseEnv(await fs.readFile(path.join(root, "projects", profile, name), "utf8"))); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return values;
}
const retry = async operation => {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) { if (attempt >= 3 || (error.$metadata?.httpStatusCode < 500 && !["SlowDown", "RequestTimeout", "XAmzContentSHA256Mismatch"].includes(error.name))) throw error; await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1))); }
  }
};
async function pool(items, count, operation) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(count, items.length) }, async () => { while (cursor < items.length) await operation(items[cursor++]); }));
}
function aliases(app, origin) {
  const rules = [{ origin, stripPrefix: "/releases/", localPrefix: "" }];
  // Versioned original game URLs continue to resolve to this app's exact local
  // snapshot instead of mixing a newer translation channel with older data.
  if (app === "wow-forever") return [{ origin, releasePrefix: true }];
  if (app === "project-zomboid") return [{ origin, stripPrefix: "/b42.20.2-r1/knox-country/", localPrefix: "map-data/knox-country/" }];
  return rules.map(rule => ({ ...rule, releasePrefix: true }));
}
async function publishOne(app, record) {
  const profile = PUBLISH_PROFILES[app] ?? app;
  const env = await envFor(profile);
  const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
  if (required.some(key => !env[key]?.trim())) return null;
  const configured = env.R2_PUBLIC_ORIGIN || env.ASSET_CDN_ORIGIN || PROFILE_ORIGINS[profile];
  if (!configured) return null;
  const origin = new URL(configured.includes("://") ? configured : `https://${configured}`).origin;
  if (!origin.startsWith("https://")) throw new Error(`${app}: HTTPS public origin is required`);
  const client = new S3Client({ region: "auto", endpoint: env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY }, requestChecksumCalculation: "WHEN_REQUIRED" });
  const bucket = env.R2_BUCKET;
  const prefix = `map-it/v1/${app}/releases/${record.fingerprint}`;
  const baseUrl = `${origin}/${prefix}`;
  // Select a fresh image cache key after BG3's read CORS was configured.
  const urlSuffix = app === "baldurs-gate-3" ? "?map-it=1" : "";
  const prior = await fs.readFile(path.join(cacheRoot, "receipts", `${app}-${record.fingerprint}.json`), "utf8").then(JSON.parse).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  const reuse = prior?.baseUrl === baseUrl && prior.objectsVerified === Object.keys(record.files).length;
  try {
    if (!process.argv.includes("--no-configure-cors")) try {
      const rules = (await client.send(new GetBucketCorsCommand({ Bucket: bucket })).catch(error => { if (error.$metadata?.httpStatusCode === 404) return {}; throw error; })).CORSRules || [];
      if (!rules.some(rule => rule.AllowedOrigins?.includes("*") && ["GET", "HEAD"].every(method => rule.AllowedMethods?.includes(method)))) {
        rules.push({ ID: "map-it-public-content", AllowedOrigins: ["*"], AllowedMethods: ["GET", "HEAD"], AllowedHeaders: ["*"], ExposeHeaders: ["ETag", "Content-Type", "Cache-Control"], MaxAgeSeconds: 3600 });
        await client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: rules } }));
      }
    } catch (error) { if (error.$metadata?.httpStatusCode !== 403 && error.name !== "AccessDenied") throw error; }
    const files = Object.entries(record.files);
    if (!reuse) {
    const existing = new Map(); let token;
    do {
      const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix + "/", ContinuationToken: token }));
      for (const object of listed.Contents || []) existing.set(object.Key, object);
      token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (token);
    let uploaded = 0, verified = 0;
    await pool(files, 12, async ([relative, file]) => {
      const key = `${prefix}/${relative}`; const found = existing.get(key);
      if (found) {
        // Single-part R2 objects have the MD5 ETag verified during upload.
        // Listing checks every byte checksum/size without a HEAD per object.
        if (found.Size !== file.storedSize || found.ETag?.replaceAll('"', "") !== file.md5) throw new Error(`${app}: immutable content collision at ${relative}`);
      } else {
        const body = await fs.readFile(file.storedFile);
        if (digest(body) !== file.storedSha256) throw new Error("Prepared upload bytes changed");
        const result = await retry(() => client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentLength: body.length, ContentType: file.mime, ...(file.gzip ? { ContentEncoding: "gzip" } : {}), ContentMD5: Buffer.from(file.md5, "hex").toString("base64"), CacheControl: "public, max-age=31536000, immutable", Metadata: { sha256: file.sha256, "source-size": String(file.size), "stored-sha256": file.storedSha256 } })));
        if (result.ETag?.replaceAll('"', "") !== file.md5) throw new Error("Uploaded object checksum did not match");
        uploaded++;
      }
      verified++;
      if (verified % 200 === 0 || verified === files.length) console.log(JSON.stringify({ app, verified, total: files.length, uploaded }));
    });
    } else console.log(JSON.stringify({ app, verified: files.length, reuse: "immutable verified release; checking public content again" }));
    const publicManifest = { version: 1, app, fingerprint: record.fingerprint, files: files.map(([name, file]) => ({ path: name, size: file.size, sha256: file.sha256 })) };
    const body = Buffer.from(JSON.stringify(publicManifest));
    const manifestMd5 = createHash("md5").update(body).digest("base64");
    if (!reuse) await client.send(new PutObjectCommand({ Bucket: bucket, Key: prefix + "/release-manifest.json", Body: body, ContentType: "application/json; charset=utf-8", ContentMD5: manifestMd5, CacheControl: "public, max-age=31536000, immutable" }));
    const sampleGroups = new Set(); const samples = new Map();
    for (const [name, file] of files) {
      const group = name.split("/").slice(0, -1).slice(0, 2).join("/") + path.extname(name);
      if (!sampleGroups.has(group) || record.prefetch.includes(name) || name.startsWith("locale-data/")) { sampleGroups.add(group); samples.set(name, file); }
    }
    await pool([...samples], 4, async ([relative, file]) => {
      const response = await fetch(baseUrl + "/" + relative.split("/").map(encodeURIComponent).join("/") + urlSuffix, { headers: { Origin: "http://localhost:5190" }, signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`${app}: public CDN returned ${response.status} for ${relative}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length !== file.size || digest(bytes) !== file.sha256) throw new Error(`${app}: public CDN bytes do not match ${relative}`);
      if (!["*", "http://localhost:5190"].includes(response.headers.get("access-control-allow-origin"))) throw new Error(`${app}: public read CORS must be enabled for ${relative}`);
      if (!(response.headers.get("cache-control") || "").includes("immutable")) throw new Error(`${app}: immutable caching is missing`);
      if (!(response.headers.get("content-type") || "").startsWith(file.mime.split(";")[0])) throw new Error(`${app}: incorrect content type for ${relative}`);
    });
    const response = await fetch(baseUrl + "/release-manifest.json", { headers: { Origin: "http://localhost:5190" }, signal: AbortSignal.timeout(30000) });
    if (!response.ok || digest(Buffer.from(await response.arrayBuffer())) !== digest(body)) throw new Error(`${app}: public release manifest mismatch`);
    const receipt = { version: 1, app, fingerprint: record.fingerprint, baseUrl, urlSuffix, origin, objectsVerified: files.length, publicSamplesVerified: samples.size, manifestSha256: digest(body) };
    await writeJson(path.join(cacheRoot, "receipts", `${app}-${record.fingerprint}.json`), receipt);
    return receipt;
  } finally { client.destroy(); }
}

async function main() {
  const bytes = await fs.readFile(path.join(cacheRoot, "plan.json")); const plan = JSON.parse(bytes);
  const receipts = {}; const missing = []; const failures = [];
  const selected = process.argv.find(value => value.startsWith("--app="))?.slice(6);
  if (selected && !plan.apps[selected]) throw new Error("Unknown app selection");
  for (const [app, record] of Object.entries(plan.apps)) {
    if (selected && selected !== app) continue;
    if (!Object.keys(record.files).length) continue;
    try {
      const receipt = await publishOne(app, record);
      if (receipt) receipts[app] = receipt;
      else missing.push(app);
    } catch (error) { failures.push(app); console.error(JSON.stringify({ app, error: error.name, detail: error.message.startsWith(app + ":") ? error.message : "Upload or verification failed; credentials were not printed." })); }
  }
  if (missing.length || failures.length) { console.log(JSON.stringify({ status: "incomplete", missingProfiles: missing, failedProfiles: failures })); process.exitCode = 2; return; }
  if (selected) { console.log(JSON.stringify({ status: "passed", verifiedApp: selected })); return; }
  const generated = {};
  for (const [app, record] of Object.entries(plan.apps)) {
    const receipt = receipts[app];
    const config = { appId: app, baseUrl: receipt?.baseUrl || "", files: Object.fromEntries(Object.entries(record.files).map(([name, file]) => [name, [file.size, file.sha256]])), redirects: record.redirects, aliases: receipt ? aliases(app, receipt.origin) : [], virtualLocales: record.virtualLocales, prefetch: record.prefetch };
    config.urlSuffix = receipt?.urlSuffix || "";
    const body = Buffer.from("globalThis.__MAP_IT_CONTENT_CONFIG__=" + JSON.stringify(config).replaceAll("<", "\\u003c") + ";\n");
    const file = path.join(cacheRoot, "configs", `${app}.js`); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, body);
    generated[`apps/${app}/content-config.js`] = { file, sha256: digest(body), size: body.length };
  }
  const release = { version: 1, planSha256: digest(bytes), receipts, generated };
  await writeJson(path.join(root, "config/app-content-release.json"), release);
  console.log(JSON.stringify({ status: "passed", profilesPublishedAndVerified: Object.keys(receipts).length, planSha256: release.planSha256 }));
}
await main();
