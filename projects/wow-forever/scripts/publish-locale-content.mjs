/** Publish a consistent locale snapshot, then switch its small CDN pointer. */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { loadEnv } from "vite";
import { releaseContentBaseUrl, uploadReleaseContent } from "./upload-release-content.mjs";

const root = path.resolve(import.meta.dirname, "..");
const mode = process.argv[2];
if (process.argv.length !== 3 || !["--dry-run", "--upload"].includes(mode)) {
  throw new Error("Use --dry-run to inspect or --upload to publish locales.");
}
const env = loadEnv("production", root, "");
const channelKey = "locales/wow-forever/current.json";
const directories = [
  { source: "public/data/locales/wow-forever", target: "data/locales/wow-forever" },
  { source: "public/data/classes/locales", target: "data/classes/locales" },
  { source: "public/data/classes/guides/locales", target: "data/classes/guides/locales" },
  { source: "public/data/guides/locales", target: "data/guides/locales" },
  { source: "public/data/spells/writeups/locales", target: "data/spells/writeups/locales" },
  { source: "src/i18n/locales", target: "data/locales/app" },
];
const sha = async (filename) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
};
const sameStat = (a, b) => a.size === b.size && a.mtimeMs === b.mtimeMs;
const localeFiles = async (directory, prefix = "") => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!/^[a-zA-Z0-9-]+(?:\.json)?$/.test(entry.name)) {
      throw new Error(`Unexpected locale entry: ${entry.name}`);
    }
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await localeFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(relative);
    else throw new Error(`Unexpected locale entry: ${relative}`);
  }
  return files.sort();
};

async function snapshot(stage) {
  const before = [];
  for (const directory of directories) {
    const sourceDir = path.join(root, directory.source);
    const targetDir = path.join(stage, directory.target);
    await mkdir(targetDir, { recursive: true });
    for (const name of await localeFiles(sourceDir)) {
      const source = path.join(sourceDir, ...name.split("/"));
      const target = path.join(targetDir, ...name.split("/"));
      const initial = await stat(source);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
      JSON.parse(await readFile(target, "utf8"));
      const final = await stat(source);
      if (!sameStat(initial, final)) throw new Error(`Locale changed during snapshot: ${name}`);
      before.push({ source, target, initial, name, directory });
    }
  }
  for (const { source, initial, name } of before) {
    if (!sameStat(initial, await stat(source))) throw new Error(`Locale changed during snapshot: ${name}`);
  }
  const proseTimes = before.filter(({ name, directory }) =>
    directory.target.endsWith("wow-forever") && /^quest-prose-wowhead-(?:deDE|esES|esMX|frFR|koKR|ptBR|zhCN|zhTW)\.json$/.test(name))
    .map(({ initial }) => initial.mtimeMs);
  if (proseTimes.length !== 8 || Math.max(...proseTimes) - Math.min(...proseTimes) > 15_000) {
    throw new Error("Quest prose packs are between importer batches");
  }
  const files = [];
  const fingerprintHash = createHash("sha256");
  for (const { target, directory, name } of before.sort((a, b) =>
    `${a.directory.target}/${a.name}`.localeCompare(`${b.directory.target}/${b.name}`))) {
    const relativePath = `${directory.target}/${name}`;
    const size = (await stat(target)).size;
    const sha256 = await sha(target);
    files.push({ path: relativePath, sourcePath: target, size, sha256 });
    fingerprintHash.update(`${relativePath}\0${size}\0${sha256}\n`);
  }
  return { files, fingerprint: fingerprintHash.digest("hex").slice(0, 24) };
}

async function publishChannel(fingerprint) {
  const required = ["R2_BUCKET", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
  for (const key of required) if (!env[key]?.trim()) throw new Error(`${key} is required`);
  const endpoint = env.R2_ENDPOINT?.trim() || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  if (new URL(endpoint).protocol !== "https:") throw new Error("R2 endpoint must use HTTPS");
  const client = new S3Client({ region: "auto", endpoint, credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  }, requestChecksumCalculation: "WHEN_REQUIRED" });
  const body = JSON.stringify({ version: 1, fingerprint });
  try {
    await client.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: channelKey,
      Body: body, ContentType: "application/json; charset=utf-8", CacheControl: "no-store" }));
  } finally {
    client.destroy();
  }
  const url = `${new URL(env.R2_PUBLIC_ORIGIN).origin}/${channelKey}`;
  const response = await fetch(`${url}?verify=${Date.now()}`, { cache: "no-store", headers: { Origin: "http://127.0.0.1" } });
  if (!response.ok || response.headers.get("access-control-allow-origin") !== "*" ||
    (await response.json()).fingerprint !== fingerprint) {
    throw new Error("Published locale channel did not verify");
  }
  console.log(`Locale channel active: ${url}`);
}

let stage;
try {
  let plan;
  for (let attempt = 1; attempt <= 4; attempt++) {
    stage = await mkdtemp(path.join(os.tmpdir(), "wow-forever-locales-"));
    try { plan = await snapshot(stage); break; }
    catch (error) {
      if (attempt === 4) throw error;
      await rm(stage, { recursive: true, force: true });
      stage = undefined;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  const baseUrl = releaseContentBaseUrl(env.R2_PUBLIC_ORIGIN?.trim(), plan.fingerprint);
  console.log(`Locale snapshot: ${plan.files.length} files, ${plan.files.reduce((total, file) => total + file.size, 0)} bytes`);
  console.log(`Immutable locale URL: ${baseUrl}`);
  if (mode === "--upload") {
    await uploadReleaseContent(plan, env);
    for (const file of plan.files.filter(({ path: name }) =>
      /quest-prose-wowhead-(?:deDE|esES|esMX|frFR|koKR|ptBR|zhCN|zhTW)\.json$/.test(name) ||
      name === "data/locales/app/en.json")) {
      const response = await fetch(`${baseUrl}/${file.path}`, { headers: { Origin: "http://127.0.0.1" } });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok || bytes.length !== file.size ||
        createHash("sha256").update(bytes).digest("hex") !== file.sha256 ||
        response.headers.get("access-control-allow-origin") !== "*") {
        throw new Error(`Locale CDN verification failed: ${file.path}`);
      }
    }
    await publishChannel(plan.fingerprint);
  }
} finally {
  if (stage && path.dirname(stage) === path.resolve(os.tmpdir()) &&
    path.basename(stage).startsWith("wow-forever-locales-")) {
    await rm(stage, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}
