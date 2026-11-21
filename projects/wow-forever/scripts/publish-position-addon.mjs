import { readFile } from "node:fs/promises";
import path from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { loadEnv } from "vite";
import { loadPositionAddonRuntime, preparePositionAddonRelease, publishPositionAddonRelease,
  readPositionAddonRelease } from "./position-addon-release.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const modes = args.filter(arg => arg === "--dry-run" || arg === "--upload");
const values = {};
for (let index = 0; index < args.length; index++) {
  const key = args[index];
  if (["--dry-run", "--upload"].includes(key)) continue;
  if (!["--source", "--version", "--interface-version", "--release"].includes(key) || !args[index + 1] ||
      args[index + 1].startsWith("--") || key in values) throw new Error(`Invalid argument: ${key}`);
  values[key] = args[++index];
}
if (modes.length !== 1 || (values["--release"]
  ? Object.keys(values).length !== 1
  : !values["--source"] || !values["--version"] || !values["--interface-version"])) {
  throw new Error("Use --source <lua> --version <semver> --interface-version <number> (--dry-run | --upload), or --release <sha256> (--dry-run | --upload).");
}
const { config } = await loadPositionAddonRuntime();
const verified = values["--release"]
  ? await readPositionAddonRelease(config.cdnBaseUrl, values["--release"])
  : await preparePositionAddonRelease(await readFile(path.resolve(values["--source"]), "utf8"),
    values["--version"], Number(values["--interface-version"]));
console.log(`Addon ${verified.addon.version}; interface ${verified.addon.interfaceVersion}; protocol ${verified.addon.protocolVersion}`);
console.log(`Verified payload: ${config.cdnBaseUrl}/releases/${verified.sha256}.json`);
console.log(`Size: ${Buffer.byteLength(verified.serialized)} bytes`);
if (modes[0] === "--upload") {
  const env = loadEnv("production", root, "");
  for (const name of ["R2_BUCKET", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PUBLIC_ORIGIN"]) {
    if (!env[name]?.trim()) throw new Error(`${name} is required`);
  }
  if (new URL(env.R2_PUBLIC_ORIGIN).origin !== new URL(config.cdnBaseUrl).origin) throw new Error("R2 origin differs from the configured addon CDN");
  const endpoint = env.R2_ENDPOINT?.trim() || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  if (new URL(endpoint).protocol !== "https:") throw new Error("R2 endpoint must use HTTPS");
  const client = new S3Client({ region: "auto", endpoint, credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  }, requestChecksumCalculation: "WHEN_REQUIRED" });
  try {
    const result = await publishPositionAddonRelease(verified, { client, bucket: env.R2_BUCKET, baseUrl: config.cdnBaseUrl });
    console.log(`Addon channel ${result.changed ? "published and verified" : "already current"}: ${config.cdnBaseUrl}/current.json`);
  } finally { client.destroy(); }
}
