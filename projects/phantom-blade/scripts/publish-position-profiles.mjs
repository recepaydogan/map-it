import { readFile } from "node:fs/promises";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { loadEnv } from "vite";
import { POSITION_PROFILES_URL } from "../src/game-config.ts";
import { parsePositionProfileCatalog } from "../src/features/live-position/position-profile-catalog.ts";
import { digest, root } from "./release-content.mjs";
import { releaseContentBaseUrl } from "./upload-release-content.mjs";

const flags = process.argv.slice(2);
if (flags.length > 1 || (flags.length === 1 && !["--dry-run", "--upload"].includes(flags[0]))) {
  throw new Error("Use --dry-run or --upload.");
}
const raw = await readFile(new URL("../native/position-reader/profiles-v1.json", import.meta.url), "utf8");
const catalog = parsePositionProfileCatalog(raw);
if (!catalog) throw new Error("Invalid position profile catalog.");
const body = Buffer.from(JSON.stringify(catalog));
const url = new URL(POSITION_PROFILES_URL);
const key = url.pathname.slice(1);
console.log(`${key}: ${catalog.profiles.map(({ build }) => build).join(", ") || "all profiles disabled"}`);
if (!flags.includes("--upload")) process.exit(0);

const env = loadEnv("production", root, "");
for (const name of ["R2_PUBLIC_ORIGIN", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) {
  if (!env[name]?.trim()) throw new Error(`${name} is missing.`);
}
if (new URL(releaseContentBaseUrl(env.R2_PUBLIC_ORIGIN, "profiles")).origin !== url.origin) {
  throw new Error("R2_PUBLIC_ORIGIN differs from the app's position profile origin.");
}
const endpoint = env.R2_ENDPOINT?.trim() || `https://${env.R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com`;
if (new URL(endpoint).protocol !== "https:") throw new Error("R2_ENDPOINT must use HTTPS.");
const client = new S3Client({
  region: "auto", endpoint, requestChecksumCalculation: "WHEN_REQUIRED",
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID.trim(), secretAccessKey: env.R2_SECRET_ACCESS_KEY.trim() },
});
const object = { Bucket: env.R2_BUCKET.trim(), Key: key };
const cacheControl = "no-store";
try {
  let previous;
  try {
    previous = await client.send(new HeadObjectCommand(object));
  } catch (error) {
    if (error.$metadata?.httpStatusCode !== 404) throw error;
  }
  const sha256 = digest(body);
  if (previous?.Metadata?.sha256 !== sha256 || previous.CacheControl !== cacheControl) {
    await client.send(new PutObjectCommand({
      ...object, Body: body, ContentType: "application/json; charset=utf-8", CacheControl: cacheControl,
      Metadata: { sha256 },
      ...(previous ? { IfMatch: previous.ETag } : { IfNoneMatch: "*" }),
    }));
  }
  const response = await fetch(url, {
    headers: { Origin: "null" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok || digest(Buffer.from(await response.arrayBuffer())) !== sha256
    || !response.headers.get("content-type")?.startsWith("application/json")
    || !response.headers.get("cache-control")?.includes("no-store")
    || response.headers.get("access-control-allow-origin") !== "*") {
    throw new Error(`Public CDN verification failed (HTTP ${response.status}).`);
  }
  console.log(`Verified ${url.href} (SHA-256 ${sha256}).`);
} finally {
  client.destroy();
}
