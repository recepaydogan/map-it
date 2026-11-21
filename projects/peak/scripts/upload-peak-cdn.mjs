import { createHash, createHmac } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { request } from "node:https";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(projectRoot, ".env");
const defaultPrefix = "peak/data/peak";

const loadEnvFile = async () => {
  const values = {};
  try {
    const contents = await readFile(envPath, "utf8");
    for (const line of contents.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const separator = trimmed.indexOf("=");
      const name = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/gu, "");
      values[name] = value;
    }
  }
  catch {
    // Environment variables are sufficient in CI or deployment shells.
  }
  return values;
};

const envFile = await loadEnvFile();
const env = (name) => process.env[name] ?? envFile[name] ?? "";
const args = process.argv.slice(2);
const sourceIndex = args.indexOf("--source-root");
const sourceRoot = resolve(sourceIndex >= 0 ? args[sourceIndex + 1] : join(projectRoot, "artifacts", "peak-data"));
const assetsOnly = args.includes("--assets-only");
const catalogOnly = args.includes("--catalog-only");
if (assetsOnly && catalogOnly) throw new Error("Use either --assets-only or --catalog-only, not both.");
const dryRun = args.includes("--dry-run");
const catalogKeyIndex = args.indexOf("--catalog-key");
const catalogKey = catalogKeyIndex >= 0 ? args[catalogKeyIndex + 1] : "catalog.json";
if (!["catalog.json", "catalog-v4.json"].includes(catalogKey)) throw new Error("Invalid catalog key");
const prefixArgumentIndex = args.indexOf("--prefix");
const prefix = (prefixArgumentIndex >= 0 ? args[prefixArgumentIndex + 1] : null)
  || env("R2_PREFIX")
  || defaultPrefix;
const normalizedPrefix = prefix.replace(/^\/+|\/+$/gu, "");

// Partial upload directories must be tied to the complete validated release.
const validationIndex = args.indexOf("--validation-root");
if (validationIndex >= 0 && !args[validationIndex + 1]) throw new Error("Missing --validation-root value");
const validationRoot = validationIndex >= 0 ? resolve(args[validationIndex + 1]) : sourceRoot;
execFileSync(process.execPath, [join(projectRoot, "scripts", "validate-peak-data.mjs"),
  "--data-directory", validationRoot], { stdio: "inherit" });
const validatedCatalog = await readFile(join(validationRoot, "catalog.json"));
if ((JSON.parse(validatedCatalog).schemaVersion === 4) !== (catalogKey === "catalog-v4.json")) {
  throw new Error("Catalog schema requires its matching publication key; legacy catalog must remain unchanged");
}
if (!(await readFile(join(sourceRoot, "catalog.json"))).equals(validatedCatalog)) {
  throw new Error("Upload catalog differs from the validated release");
}

const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_ENDPOINT"];
if (!dryRun) {
  for (const name of required) {
    if (!env(name)) throw new Error(`Missing ${name} in .env or the process environment.`);
  }
}

const contentType = (path) => {
  const extension = basename(path).split(".").at(-1)?.toLowerCase();
  return {
    json: "application/json; charset=utf-8",
    png: "image/png",
    webp: "image/webp",
  }[extension] ?? "application/octet-stream";
};

const collectFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else if (entry.isFile() && entry.name !== "map-capture.json") files.push(path);
  }
  return files.sort();
};

const encodePath = (path) => path.split("/").map((part) => encodeURIComponent(part)).join("/");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hmac = (key, value) => createHmac("sha256", key).update(value).digest();

const signedRequest = async (filePath, key, configuration) => {
  const body = await readFile(filePath);
  const payloadHash = sha256(body);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/gu, "").replace("Z", "Z");
  const dateStamp = amzDate.slice(0, 8);
  const encodedKey = encodePath(`${configuration.bucket}/${key}`);
  const headers = {
    "cache-control": key.endsWith(".json")
      ? "public, max-age=300, must-revalidate"
      : "public, max-age=31536000, immutable",
    "content-length": String(body.length),
    "content-type": contentType(filePath),
    host: configuration.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(!key.endsWith('.json') ? { 'if-none-match': '*' } : {}),
  };
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name].trim()}\n`)
    .join("");
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalRequest = [
    "PUT",
    `/${encodedKey}`,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const dateKey = hmac(Buffer.from(`AWS4${configuration.secretAccessKey}`), dateStamp);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${configuration.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  await new Promise((resolveRequest, rejectRequest) => {
    const uploadRequest = request({
      method: "PUT",
      hostname: configuration.host,
      path: `/${encodedKey}`,
      headers,
    }, (response) => {
      const responseChunks = [];
      response.on("data", (chunk) => responseChunks.push(chunk));
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) resolveRequest();
        else rejectRequest(new Error(`R2 upload failed for ${key}: HTTP ${response.statusCode}`));
      });
    });
    uploadRequest.on("error", rejectRequest);
    uploadRequest.setTimeout(120_000, () => uploadRequest.destroy(new Error(`Upload timed out for ${key}`)));
    uploadRequest.end(body);
  });
  return { bytes: body.length, sha256: payloadHash };
};

const files = (await collectFiles(sourceRoot)).filter((path) => {
  const isCatalog = relative(sourceRoot, path) === "catalog.json";
  return assetsOnly ? !isCatalog : catalogOnly ? isCatalog : true;
});
const uploads = files.map((filePath) => ({
  filePath,
  key: `${normalizedPrefix}/${relative(sourceRoot, filePath) === "catalog.json"
    ? catalogKey : relative(sourceRoot, filePath).replaceAll("\\", "/")}`,
})).sort((left, right) => {
  // Publish the catalog last so clients never receive asset URLs before the
  // corresponding immutable files have finished uploading.
  const leftIsCatalog = left.key.endsWith(`/${catalogKey}`);
  const rightIsCatalog = right.key.endsWith(`/${catalogKey}`);
  if (leftIsCatalog !== rightIsCatalog) return leftIsCatalog ? 1 : -1;
  return left.key.localeCompare(right.key);
});
if (validationRoot !== sourceRoot) {
  for (const { filePath } of uploads) {
    const validatedPath = join(validationRoot, relative(sourceRoot, filePath));
    if (sha256(await readFile(filePath)) !== sha256(await readFile(validatedPath))) {
      throw new Error(`Upload file differs from validated release: ${relative(sourceRoot, filePath)}`);
    }
  }
}
const totalBytes = (await Promise.all(uploads.map(async ({ filePath }) => (await stat(filePath)).size)))
  .reduce((sum, size) => sum + size, 0);

console.log(`PEAK CDN upload plan: ${uploads.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`);
console.log(`Bucket: ${env("R2_BUCKET") || "(from environment)"}`);
console.log(`Prefix: ${normalizedPrefix}/`);
if (dryRun) {
  for (const upload of uploads) console.log(`${upload.key} <- ${relative(projectRoot, upload.filePath)}`);
  process.exit(0);
}

const endpoint = new URL(env("R2_ENDPOINT"));
const configuration = {
  accessKeyId: env("R2_ACCESS_KEY_ID"),
  bucket: env("R2_BUCKET"),
  host: endpoint.host,
  secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
};
for (let index = 0; index < uploads.length; index += 1) {
  const upload = uploads[index];
  const result = await signedRequest(upload.filePath, upload.key, configuration);
  console.log(`[${index + 1}/${uploads.length}] ${upload.key} (${(result.bytes / 1024 / 1024).toFixed(2)} MiB)`);
}
console.log("PEAK CDN upload complete.");
