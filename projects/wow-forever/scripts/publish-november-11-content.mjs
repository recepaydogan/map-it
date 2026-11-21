/** Publish only the reviewed hotfix delta over the live content and locale releases. */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadEnv } from "vite";
import { CopyObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { uploadReleaseContent, releaseContentBaseUrl } from "./upload-release-content.mjs";
import { validContentPath, isTranslationPath } from "./reviewed-content-plan.mjs";

const root = path.resolve(import.meta.dirname, "..");
const audit = path.join(root, "data/site-research/hotfix-2026-11-11", process.argv.includes("--refinement") ? "refinement" : "");
const env = loadEnv("production", root, "");
const origin = new URL(env.R2_PUBLIC_ORIGIN).origin;
const configPath = path.join(root, "src/game-config.ts");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = async (file) => JSON.parse(await readFile(file, "utf8"));
const save = async (file, value) => writeFile(file, JSON.stringify(value, null, 2) + "\n");
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const jsonBytes = (value) => Buffer.from(JSON.stringify(value) + "\n");
const channelKey = "locales/wow-forever/current.json";

async function get(url) {
  const response = await fetch(url, { headers: { Origin: "http://127.0.0.1" }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function parallel(entries, action, concurrency = 12) {
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < entries.length) await action(entries[next++]);
  }));
}

// Three-way merge fails closed when the same leaf changed on the published channel.
// Unrelated dirty worktree changes are never part of the before/after delta.
function merge(before, after, published, location) {
  if (equal(before, after)) return published;
  if (equal(published, after)) return published;
  if (object(before) && object(after) && object(published)) {
    const result = structuredClone(published);
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (equal(before[key], after[key])) continue;
      const value = merge(before[key], after[key], published[key], `${location}/${key}`);
      if (value === undefined) delete result[key];
      else result[key] = value;
    }
    return result;
  }
  if (Array.isArray(before) && Array.isArray(after) && Array.isArray(published)
    && before.length === after.length && before.length === published.length) {
    return after.map((value, index) => merge(before[index], value, published[index], `${location}/${index}`));
  }
  if (!equal(before, published)) throw new Error(`Published value conflicts with the reviewed delta: ${location}`);
  return structuredClone(after);
}

async function planFor(stage, filenames) {
  const files = [];
  const fingerprint = createHash("sha256");
  for (const name of [...filenames].sort()) {
    if (!validContentPath(name) || /addon-prototype|map-prototype/i.test(name)) throw new Error(`Unsafe release path: ${name}`);
    const sourcePath = path.join(stage, ...name.split("/"));
    const bytes = await readFile(sourcePath);
    if (name.startsWith("data/locales/app/") && Object.hasOwn(JSON.parse(bytes), "mapAddonPrototype")) {
      throw new Error("Unpublished addon locale must not be published.");
    }
    const file = { path: name, sourcePath, size: bytes.length, sha256: sha(bytes) };
    files.push(file);
    fingerprint.update(`${name}\0${file.size}\0${file.sha256}\n`);
  }
  return { files, fingerprint: fingerprint.digest("hex").slice(0, 24) };
}

async function prepare() {
  const scope = await read(path.join(audit, "changes.json"));
  const config = await readFile(configPath, "utf8");
  const contentBase = config.match(/DEFAULT_CONTENT_BASE_URL = "([^"]+)"/)[1];
  const dungeonBase = config.match(/DEFAULT_DUNGEON_CONTENT_BASE_URL = "([^"]+)"/)[1];
  const pointer = JSON.parse(await get(`${origin}/${channelKey}`));
  const localeBase = releaseContentBaseUrl(origin, pointer.fingerprint);
  for (const [kind, base] of [["content", contentBase], ["dungeons", dungeonBase], ["locales", localeBase]]) {
    const baseline = JSON.parse(await get(`${base}/release-manifest.json`));
    if (baseline.fingerprint !== base.split("/").at(-1)
      || baseline.files.some((file) => !validContentPath(file.path))) throw new Error("Invalid baseline manifest");
    const selected = new Map(scope.paths.map((localPath) => [
      localPath.startsWith("src/") ? `data/locales/app/${path.basename(localPath)}` : localPath.slice(7), localPath,
    ]).filter(([name]) => kind === "dungeons" ? name.startsWith("data/dungeons/") : isTranslationPath(name) === (kind === "locales")));
    const stage = await mkdtemp(path.join(os.tmpdir(), "wow-hotfix-"));
    await parallel(baseline.files, async (file) => {
      const localPath = selected.get(file.path) ?? (file.path.startsWith("data/locales/app/")
        ? `src/i18n/locales/${path.basename(file.path)}` : `public/${file.path}`);
      let bytes = await readFile(path.join(root, localPath)).catch(() => undefined);
      if (!bytes || sha(bytes) !== file.sha256) bytes = await get(`${base}/${file.path}`);
      if (sha(bytes) !== file.sha256 || bytes.length !== file.size) throw new Error(`Baseline hash mismatch: ${file.path}`);
      if (selected.has(file.path)) {
        const before = await read(path.join(audit, "before", localPath));
        let after = await read(path.join(root, localPath));
        if (process.argv.includes("--refinement") && localPath.startsWith("src/i18n/locales/")) {
          // This follow-up changes only pin labels. Other local copy edits are
          // outside its scope and must not replace the published app locale.
          const labels = after.map.dawnWaker;
          after = structuredClone(before);
          after.map.dawnWaker = labels;
        }
        const published = JSON.parse(bytes);
        if (file.path === "data/locales/wow-forever/quest-text-source.json") {
          // This hash describes serialized catalog bytes, not a translated leaf.
          // The published baseline uses different whitespace. Check its full
          // semantic identity before normalizing this derived field; regenerate
          // it from the frozen catalog below, never accept an arbitrary conflict.
          const catalogBefore = await read(path.join(audit, "before/public/data/quests/quest-details.json"));
          const publishedCatalog = JSON.parse(await get(`${contentBase}/data/quests/quest-details.json`));
          if (!equal(catalogBefore, publishedCatalog)
            && !equal(await read(path.join(root, "public/data/quests/quest-details.json")), publishedCatalog)) {
            throw new Error("Quest catalog baseline differs semantically");
          }
          before.provenance.catalogSha256 = published.provenance.catalogSha256;
          after.provenance.catalogSha256 = published.provenance.catalogSha256;
        }
        bytes = jsonBytes(merge(before, after, published, file.path));
      }
      const target = path.join(stage, ...file.path.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
    });
    const newNames = [...selected.keys()].filter(name => !baseline.files.some(file => file.path === name));
    for (const name of newNames) {
      const localPath = selected.get(name);
      if (await read(path.join(audit, "before", localPath)) !== null
        || !/^data\/guides\/(?:(?:locales\/[^/]+\/)?dawn-waker|locales\/[^/]+\/index-v2)\.json$/.test(name)) {
        throw new Error(`Unreviewed new file: ${name}`);
      }
      const target = path.join(stage, ...name.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, jsonBytes(await read(path.join(root, localPath))));
    }
    if (kind === "locales") {
      // Provenance identifies the exact published catalog bytes, which may use
      // different JSON whitespace from the local working copy.
      const content = await read(path.join(audit, "content-release.json"));
      const catalog = await readFile(path.join(content.stage, "data/quests/quest-details.json"));
      const sourcePath = path.join(stage, "data/locales/wow-forever/quest-text-source.json");
      const source = await read(sourcePath);
      source.provenance.catalogSha256 = sha(catalog);
      await writeFile(sourcePath, jsonBytes(source));
    }
    const plan = await planFor(stage, [...baseline.files.map((file) => file.path), ...newNames]);
    const old = new Map(baseline.files.map((file) => [file.path, file.sha256]));
    const changed = plan.files.filter((file) => old.get(file.path) !== file.sha256);
    if (changed.some((file) => !selected.has(file.path))) throw new Error("Out-of-scope change");
    const receipt = { version: 1, status: "prepared", kind, baseline: base, stage,
      baselineHash: sha(jsonBytes(baseline)), fingerprint: plan.fingerprint,
      url: releaseContentBaseUrl(origin, plan.fingerprint),
      files: plan.files.map(({ path: name, size, sha256 }) => ({ path: name, size, sha256 })),
      changed: changed.map((file) => file.path), removed: [] };
    await save(path.join(audit, `${kind}-release.json`), receipt);
    console.log(JSON.stringify({ kind, status: receipt.status, changed: changed.length, url: receipt.url }));
  }
}

async function upload() {
  const receipts = [];
  for (const kind of ["content", "dungeons", "locales"]) {
    const file = path.join(audit, `${kind}-release.json`);
    const receipt = await read(file);
    if (receipt.status !== "prepared" || path.dirname(receipt.stage) !== os.tmpdir()
      || !path.basename(receipt.stage).startsWith("wow-hotfix-")) throw new Error("Invalid frozen stage");
    const baseline = JSON.parse(await get(`${receipt.baseline}/release-manifest.json`));
    if (sha(jsonBytes(baseline)) !== receipt.baselineHash) throw new Error("Baseline changed");
    const plan = await planFor(receipt.stage, receipt.files.map((entry) => entry.path));
    if (plan.fingerprint !== receipt.fingerprint) throw new Error("Frozen stage changed");
    // Carry immutable, byte-identical baseline objects within R2. This avoids
    // re-uploading the complete terrain archive for a small catalog correction.
    // Only hashes shared by the verified baseline and frozen plan qualify.
    const prior = new Map(baseline.files.map(entry => [entry.path, entry.sha256]));
    const unchanged = plan.fingerprint === baseline.fingerprint ? []
      : plan.files.filter(entry => prior.get(entry.path) === entry.sha256);
    const copier = new S3Client({ region: "auto", endpoint: env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY }, requestChecksumCalculation: "WHEN_REQUIRED" });
    let copied = 0;
    try {
      await parallel(unchanged, async entry => {
        await copier.send(new CopyObjectCommand({ Bucket: env.R2_BUCKET,
          Key: `releases/${plan.fingerprint}/${entry.path}`,
          CopySource: `${env.R2_BUCKET}/releases/${baseline.fingerprint}/${entry.path}`,
          MetadataDirective: "COPY" }));
        if (++copied % 1000 === 0) console.log(`R2 unchanged objects: ${copied}/${unchanged.length}`);
      }, 32);
    } finally { copier.destroy(); }
    await uploadReleaseContent(plan, env);
    const changed = new Set(receipt.changed);
    const verify = plan.files.filter((entry, index) => kind !== "content" || changed.has(entry.path) || index % 400 === 0);
    await parallel(verify, async (entry) => {
      const response = await fetch(`${receipt.url}/${entry.path}`, { headers: { Origin: "http://127.0.0.1" } });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok || bytes.length !== entry.size || sha(bytes) !== entry.sha256
        || response.headers.get("access-control-allow-origin") !== "*"
        || !response.headers.get("cache-control")?.includes("immutable")
        || (entry.path.endsWith(".json") && !response.headers.get("content-type")?.startsWith("application/json"))) {
        throw new Error(`Public CDN verification failed: ${entry.path}`);
      }
    });
    receipts.push({ ...receipt, verifiedFiles: verify.length });
    console.log(`Verified ${kind}: ${verify.length} files`);
  }
  const [content, dungeons, locales] = receipts;
  const current = JSON.parse(await get(`${origin}/${channelKey}`));
  const config = await readFile(configPath, "utf8");
  if (current.fingerprint !== locales.baseline.split("/").at(-1)
    || !config.includes(`DEFAULT_CONTENT_BASE_URL = "${content.baseline}"`)
    || !config.includes(`DEFAULT_DUNGEON_CONTENT_BASE_URL = "${dungeons.baseline}"`)) throw new Error("Release advanced during upload");
  const client = new S3Client({ region: "auto", endpoint: env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY }, requestChecksumCalculation: "WHEN_REQUIRED" });
  try {
    await client.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: channelKey,
      Body: JSON.stringify({ version: 1, fingerprint: locales.fingerprint }),
      ContentType: "application/json; charset=utf-8", CacheControl: "no-store" }));
  } finally { client.destroy(); }
  if (JSON.parse(await get(`${origin}/${channelKey}`)).fingerprint !== locales.fingerprint) throw new Error("Locale pointer verification failed");
  await writeFile(configPath, config.replace(`DEFAULT_CONTENT_BASE_URL = "${content.baseline}"`, `DEFAULT_CONTENT_BASE_URL = "${content.url}"`)
    .replace(`DEFAULT_DUNGEON_CONTENT_BASE_URL = "${dungeons.baseline}"`, `DEFAULT_DUNGEON_CONTENT_BASE_URL = "${dungeons.url}"`)
    .replace(/DEFAULT_LOCALE_CONTENT_BASE_URL = "[^"]+"/, `DEFAULT_LOCALE_CONTENT_BASE_URL = "${locales.url}"`));
  for (const receipt of receipts) await save(path.join(audit, `${receipt.kind}-release.json`), { ...receipt, status: "verified", activated: true });
  console.log("Activated verified hotfix content, dungeons and locales.");
}

if (process.argv[2] === "--prepare") await prepare();
else if (process.argv[2] === "--upload") await upload();
else throw new Error("Use --prepare, verify the frozen stages, then --upload");
