/** Publish trainer map data and icon changes atop the configured immutable CDN release. */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadEnv } from "vite";
import { createReleaseContentPlan } from "./release-content.mjs";
import { releaseContentBaseUrl, uploadReleaseContent } from "./upload-release-content.mjs";

const changedPaths = [
  "data/map-search/index.json",
  "maps/world-atlas/locations-profession-trainers.json",
  "maps/world-atlas/locations-class-trainers.json",
  "maps/client-icons/class-trainers/default.svg",
  "maps/client-icons/class-trainers/druid.svg",
  "maps/client-icons/class-trainers/hunter.svg",
  "maps/client-icons/class-trainers/mage.svg",
  "maps/client-icons/class-trainers/paladin.svg",
  "maps/client-icons/class-trainers/priest.svg",
  "maps/client-icons/class-trainers/rogue.svg",
  "maps/client-icons/class-trainers/shaman.svg",
  "maps/client-icons/class-trainers/warlock.svg",
  "maps/client-icons/class-trainers/warrior.svg",
  "maps/client-icons/class-trainers/weapon-master.svg",
];
const changedSet = new Set(changedPaths);
const mode = process.argv[2];
if (process.argv.length !== 3 || !["--dry-run", "--upload"].includes(mode)) {
  throw new Error("Use --dry-run to inspect or --upload to publish map marker content.");
}

const root = path.resolve(import.meta.dirname, "..");
const source = await readFile(path.join(root, "src/game-config.ts"), "utf8");
const currentUrl = source.match(/DEFAULT_CONTENT_BASE_URL\s*=\s*"([^"]+)"/)?.[1];
if (!currentUrl) throw new Error("No current immutable content URL in game-config.ts.");
const env = loadEnv("production", root, "");
if (new URL(currentUrl).origin !== new URL(env.R2_PUBLIC_ORIGIN).origin) {
  throw new Error("Current CDN origin differs from the configured R2 public origin.");
}
const response = await fetch(`${currentUrl}/release-manifest.json`);
if (!response.ok) throw new Error(`Current release manifest: HTTP ${response.status}`);
const current = await response.json();
if (current.fingerprint !== currentUrl.split("/").at(-1) || !Array.isArray(current.files)) {
  throw new Error("Current release manifest does not match the configured release URL.");
}
const originalByPath = new Map(current.files.map((file) => [file.path, file]));
for (const file of current.files) {
  if (!/^(data|maps)\/[a-zA-Z0-9_./-]+$/.test(file.path)
    || file.path.split("/").includes("..") || !/^[a-f0-9]{64}$/.test(file.sha256)) {
    throw new Error(`Unsafe current release path or hash: ${file.path}`);
  }
}

const hashFile = async (filePath) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
};
const hashBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stage = await mkdtemp(path.join(os.tmpdir(), "wow-forever-markers-"));
try {
  let next = 0;
  let reusedLocal = 0;
  let restoredFromCdn = 0;
  const worker = async () => {
    while (next < current.files.length) {
      const oldFile = current.files[next++];
      if (changedSet.has(oldFile.path)) continue;
      const local = path.join(root, "public", ...oldFile.path.split("/"));
      const target = path.join(stage, ...oldFile.path.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      const localStat = await stat(local).catch(() => null);
      if (localStat?.size === oldFile.size && await hashFile(local) === oldFile.sha256) {
        await copyFile(local, target);
        reusedLocal++;
        continue;
      }
      const oldResponse = await fetch(`${currentUrl}/${oldFile.path}`);
      if (!oldResponse.ok) throw new Error(`Cannot restore ${oldFile.path}: HTTP ${oldResponse.status}`);
      const bytes = Buffer.from(await oldResponse.arrayBuffer());
      if (bytes.length !== oldFile.size || hashBytes(bytes) !== oldFile.sha256) {
        throw new Error(`Current CDN content differs from its manifest: ${oldFile.path}`);
      }
      await writeFile(target, bytes);
      restoredFromCdn++;
    }
  };
  await Promise.all(Array.from({ length: 16 }, worker));
  for (const filePath of changedPaths) {
    const local = path.join(root, "public", ...filePath.split("/"));
    const target = path.join(stage, ...filePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(local, target);
  }
  const plan = await createReleaseContentPlan(stage);
  const changed = plan.files.filter((file) =>
    originalByPath.get(file.path)?.sha256 !== file.sha256);
  const removed = current.files.filter((file) => !plan.files.some((nextFile) => nextFile.path === file.path));
  if (removed.length || changed.length !== changedPaths.length
    || changed.some((file) => !changedSet.has(file.path))) {
    throw new Error(`Unexpected release scope: ${changed.length} changed and ${removed.length} removed files.`);
  }
  const newUrl = releaseContentBaseUrl(env.R2_PUBLIC_ORIGIN, plan.fingerprint);
  console.log(`Current release: ${current.fingerprint} (${current.files.length} files)`);
  console.log(`Scoped release: ${plan.fingerprint} (${plan.files.length} files)`);
  console.log(`Reused ${reusedLocal} local files; restored ${restoredFromCdn} files from the current CDN.`);
  for (const file of changed) console.log(`Changed: ${file.path}`);
  if (mode === "--dry-run") console.log(`Planned content URL: ${newUrl}`);
  else {
    await uploadReleaseContent(plan, env);
    for (const file of changed) {
      const remote = await fetch(`${newUrl}/${file.path}`);
      if (!remote.ok || hashBytes(Buffer.from(await remote.arrayBuffer())) !== file.sha256) {
        throw new Error(`Published marker file failed HTTP/SHA-256 verification: ${file.path}`);
      }
    }
    console.log(`Verified changed marker files at ${newUrl}`);
  }
} finally {
  const tempRoot = path.resolve(os.tmpdir());
  const target = path.resolve(stage);
  if (!target.startsWith(`${tempRoot}${path.sep}`) || path.dirname(target) !== tempRoot) {
    throw new Error("Unsafe temporary release directory.");
  }
  await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
