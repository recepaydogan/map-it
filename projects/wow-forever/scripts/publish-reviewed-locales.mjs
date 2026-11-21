/** Freeze selected locale edits over the published channel; preserve every other published byte. */
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { loadEnv } from "vite";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { uploadReleaseContent, releaseContentBaseUrl } from "./upload-release-content.mjs";

const root = path.resolve(import.meta.dirname, "..");
const env = loadEnv("production", root, "");
const origin = new URL(env.R2_PUBLIC_ORIGIN).origin;
const channelKey = "locales/wow-forever/current.json";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = async (p) => JSON.parse(await readFile(p, "utf8"));
const allowed = (name) => /^data\/(?:locales\/(?:wow-forever|app)|classes\/(?:guides\/)?locales|guides\/locales|spells\/writeups\/locales)\/[A-Za-z0-9_./-]+\.json$/.test(name)
  && !name.split("/").some((p) => p === "." || p === "..");
const selectedAllowed = (name) => allowed(name) && (
  /^data\/locales\/wow-forever\/quest-objective-wowhead-(?:deDE|esES|esMX|frFR|koKR|ptBR|zhCN|zhTW)\.json$/.test(name) ||
  /^data\/locales\/wow-forever\/quest-prose-wowhead-(?:deDE|esES|esMX|frFR|koKR|ptBR|zhCN|zhTW)\.json$/.test(name) ||
  name === "data/locales/wow-forever/quest-text-esMX.json" ||
  !/\/(?:quest-|marker-|map-entity|item-)/.test(name));
const current = async () => {
  const response = await fetch(`${origin}/${channelKey}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Locale channel HTTP ${response.status}`);
  const data = await response.json();
  if (data.version !== 1 || !/^[a-f0-9]{24}$/.test(data.fingerprint)) throw new Error("Invalid locale channel");
  return data;
};
const manifest = async (base) => {
  const response = await fetch(`${base}/release-manifest.json`);
  if (!response.ok) throw new Error(`Locale manifest HTTP ${response.status}`);
  const data = await response.json();
  if (data.fingerprint !== base.split("/").at(-1) || !Array.isArray(data.files)
    || new Set(data.files.map((f) => f.path)).size !== data.files.length
    || data.files.some((f) => !allowed(f.path) || !/^[a-f0-9]{64}$/.test(f.sha256))) throw new Error("Unsafe locale manifest");
  return data;
};
const parallel = async (items, action) => {
  let cursor = 0;
  await Promise.all(Array.from({ length: 8 }, async () => { while (cursor < items.length) await action(items[cursor++]); }));
};
const save = (file, data) => writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
const planFor = async (stage, filenames) => {
  const files = [];
  const hash = createHash("sha256");
  for (const filename of [...filenames].sort()) {
    const sourcePath = path.join(stage, ...filename.split("/"));
    const bytes = await readFile(sourcePath); JSON.parse(bytes.toString("utf8"));
    const entry = { path: filename, sourcePath, size: bytes.length, sha256: sha(bytes) };
    files.push(entry); hash.update(`${filename}\0${entry.size}\0${entry.sha256}\n`);
  }
  return { files, fingerprint: hash.digest("hex").slice(0, 24) };
};
async function prepare(scopeFile, receiptFile) {
  const scope = await read(scopeFile), pointer = await current();
  const baseline = releaseContentBaseUrl(origin, pointer.fingerprint), before = await manifest(baseline);
  if (scope.version !== 1 || !Array.isArray(scope.files) || !scope.files.length
    || scope.files.some((f) => !selectedAllowed(f.path)) || new Set(scope.files.map((f) => f.path)).size !== scope.files.length) throw new Error("Unsafe locale review scope");
  const stage = await mkdtemp(path.join(os.tmpdir(), "wow-reviewed-locale-"));
  const selected = new Set(scope.files.map((f) => f.path));
  // Unselected files always come from the published baseline, never another agent's working copy.
  await parallel(before.files.filter((f) => !selected.has(f.path)), async (f) => {
    const response = await fetch(`${baseline}/${f.path}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok || bytes.length !== f.size || sha(bytes) !== f.sha256) throw new Error(`Cannot preserve ${f.path}`);
    const target = path.join(stage, ...f.path.split("/")); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes);
  });
  for (const f of scope.files) {
    const expectedLocal = f.path.startsWith("data/locales/app/") ? `src/i18n/locales/${path.basename(f.path)}` : `public/${f.path}`;
    if (f.localPath !== expectedLocal) throw new Error(`Unexpected selected locale source: ${f.path}`);
    const bytes = await readFile(path.join(root, expectedLocal));
    if (sha(bytes) !== f.sha256) throw new Error(`Selected locale changed after review: ${f.path}`);
    const target = path.join(stage, ...f.path.split("/")); await mkdir(path.dirname(target), { recursive: true });
    if (f.keys) {
      if (!f.path.startsWith("data/locales/app/") || !Array.isArray(f.keys) || !f.keys.length
        || f.keys.some(key => typeof key !== "string" || !/^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)+$/.test(key)
          || key.split(".").some(part => ["__proto__", "prototype", "constructor"].includes(part)))) throw new Error("Unsafe selected locale keys");
      const previous = before.files.find(entry => entry.path === f.path);
      if (!previous) throw new Error(`No published locale baseline: ${f.path}`);
      const response = await fetch(`${baseline}/${f.path}`);
      const published = Buffer.from(await response.arrayBuffer());
      if (!response.ok || published.length !== previous.size || sha(published) !== previous.sha256) throw new Error(`Cannot preserve ${f.path}`);
      const merged = JSON.parse(published.toString("utf8")), local = JSON.parse(bytes.toString("utf8"));
      for (const key of new Set(f.keys)) {
        const parts = key.split("."), leaf = parts.pop();
        let source = local, destination = merged;
        for (const part of parts) {
          source = source?.[part];
          if (destination[part] === undefined) destination[part] = {};
          if (!destination[part] || typeof destination[part] !== "object" || Array.isArray(destination[part])) throw new Error(`Invalid locale parent: ${key}`);
          destination = destination[part];
        }
        const value = source?.[leaf];
        const releaseNote = /^updates\.releases\.v\d+$/.test(key) && value && typeof value === "object"
          && !Array.isArray(value) && Object.keys(value).every(k => ["version", "items"].includes(k))
          && /^\d+\.\d+\.\d+$/.test(value.version) && Array.isArray(value.items)
          && value.items.length > 0 && value.items.every(item => typeof item === "string" ? Boolean(item.trim())
            : item && typeof item === "object" && Object.keys(item).length === 1 && Array.isArray(item.parts) && item.parts.length > 0
              && item.parts.every(part => part && typeof part === "object" && typeof part.text === "string"
                && Object.keys(part).every(k => ["text", "target"].includes(k))
                && (part.target === undefined || ["crafting", "help-feedback"].includes(part.target))));
        if (typeof value !== "string" && !releaseNote) throw new Error(`Missing selected locale string or release: ${key}`);
        destination[leaf] = structuredClone(value);
      }
      await save(target, merged);
    } else await copyFile(path.join(root, expectedLocal), target);
  }
  const filenames = new Set([...before.files.map((f) => f.path), ...selected]);
  const plan = await planFor(stage, filenames);
  const old = new Map(before.files.map((f) => [f.path, f.sha256]));
  const changed = plan.files.filter((f) => old.get(f.path) !== f.sha256).map(({ path: name, size, sha256 }) => ({ path: name, size, sha256 }));
  if (changed.some((f) => !selected.has(f.path))) throw new Error("Locale changed outside reviewed scope");
  const source = await read(path.join(stage, "data/locales/wow-forever/source.json"));
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const pack = await read(path.join(stage, `data/locales/wow-forever/${locale}.json`));
    if (pack.values.length !== source.keys.length) throw new Error(`Mixed source and translation arrays: ${locale}`);
  }
  const receipt = { version: 1, status: "prepared", baseline, baselineManifestSha256: sha(Buffer.from(JSON.stringify(before))),
    stage, fingerprint: plan.fingerprint, url: releaseContentBaseUrl(origin, plan.fingerprint), fileCount: plan.files.length,
    files: plan.files.map(({ path: name, size, sha256 }) => ({ path: name, size, sha256 })), changed, removed: [],
    protectedQuestAndMarkerFiles: before.files.filter((f) => !selectedAllowed(f.path)).length };
  await save(receiptFile, receipt);
  console.log(JSON.stringify({ status: receipt.status, changed: changed.length, files: plan.files.length, protected: receipt.protectedQuestAndMarkerFiles, url: receipt.url }));
}
async function upload(receiptFile) {
  const receipt = await read(receiptFile);
  if (receipt.version !== 1 || receipt.status !== "prepared" || receipt.removed.length || receipt.changed.some((f) => !selectedAllowed(f.path))
    || path.dirname(path.resolve(receipt.stage)) !== path.resolve(os.tmpdir()) || !path.basename(receipt.stage).startsWith("wow-reviewed-locale-")) throw new Error("Not a safe frozen locale release");
  if ((await current()).fingerprint !== receipt.baseline.split("/").at(-1)) throw new Error("Locale channel changed since review");
  const old = await manifest(receipt.baseline);
  if (sha(Buffer.from(JSON.stringify(old))) !== receipt.baselineManifestSha256) throw new Error("Published baseline changed");
  const plan = await planFor(receipt.stage, receipt.files.map((f) => f.path));
  if (plan.fingerprint !== receipt.fingerprint || plan.files.length !== receipt.fileCount) throw new Error("Frozen locale content changed");
  await uploadReleaseContent(plan, env);
  let verified = 0;
  await parallel(plan.files, async (f) => {
    const response = await fetch(`${receipt.url}/${f.path}`, { headers: { Origin: "http://127.0.0.1" } });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok || bytes.length !== f.size || sha(bytes) !== f.sha256
      || !response.headers.get("content-type")?.startsWith("application/json")
      || response.headers.get("access-control-allow-origin") !== "*" || !response.headers.get("cache-control")?.includes("immutable")) throw new Error(`Remote locale verification failed: ${f.path}`);
    verified++;
  });
  const preserved = await manifest(receipt.baseline);
  if (sha(Buffer.from(JSON.stringify(preserved))) !== receipt.baselineManifestSha256) throw new Error("Old locale release changed during upload");
  if ((await current()).fingerprint !== receipt.baseline.split("/").at(-1)) throw new Error("Locale channel changed during upload");
  const client = new S3Client({ region: "auto", endpoint: env.R2_ENDPOINT?.trim() || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY }, requestChecksumCalculation: "WHEN_REQUIRED" });
  try { await client.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: channelKey,
    Body: JSON.stringify({ version: 1, fingerprint: receipt.fingerprint }), ContentType: "application/json; charset=utf-8", CacheControl: "no-store" })); }
  finally { client.destroy(); }
  if ((await current()).fingerprint !== receipt.fingerprint) throw new Error("Published locale pointer did not verify");
  await save(receiptFile, { ...receipt, status: "verified", verifiedFiles: verified, oldReleasePreserved: true, activated: true });
  console.log(`Verified and activated ${verified} locale files: ${receipt.url}`);
}
const [mode, first, second] = process.argv.slice(2);
if (mode === "--prepare" && first && second) await prepare(first, second);
else if (mode === "--upload" && first && !second) await upload(first);
else throw new Error("Use --prepare scope.json receipt.json, then --upload receipt.json");
