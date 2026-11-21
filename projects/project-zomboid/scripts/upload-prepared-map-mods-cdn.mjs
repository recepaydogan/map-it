import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, relative, resolve, sep } from "node:path";

const DEFAULT_ROOT = resolve(".runtime-data/map-data/knox-country/isometric-mods");
const DEFAULT_BUCKET = "pz-map-tiles";
const DEFAULT_PREFIX = "b42.20.2-r1/knox-country/isometric-mods";
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

const argumentsByName = new Map(process.argv.slice(2).map((argument) => {
  const [name, ...valueParts] = argument.replace(/^--/, "").split("=");
  return [name, valueParts.join("=")];
}));
const root = resolve(argumentsByName.get("root") || DEFAULT_ROOT);
const bucket = argumentsByName.get("bucket") || DEFAULT_BUCKET;
const prefix = (argumentsByName.get("prefix") || DEFAULT_PREFIX).replace(/^\/+|\/+$/g, "");
const concurrency = argumentsByName.get("concurrency") || "20";
const chunkSize = Number.parseInt(argumentsByName.get("chunk-size") || "500", 10);
const resumeAt = argumentsByName.get("resume-at")?.replaceAll("\\", "/");
const requestWindowSize = Number.parseInt(argumentsByName.get("request-window-size") || "1000", 10);
const requestWindowPauseMs = Number.parseInt(argumentsByName.get("request-window-pause-ms") || "305000", 10);
const checkpointPath = resolve(argumentsByName.get("checkpoint") || ".render-cache/prepared-mod-cdn-upload.json");

if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > requestWindowSize) {
  throw new Error("Chunk size must be positive and no larger than the request window.");
}

const collectFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : Promise.resolve([path]);
  }));
  return nested.flat();
};

const toObjectKey = (file) => `${prefix}/${relative(root, file).split(sep).join("/")}`;

const runWrangler = (manifestPath, contentType, cacheControl = IMMUTABLE_CACHE_CONTROL) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [
      resolve("node_modules/wrangler/bin/wrangler.js"),
      "r2", "bulk", "put", bucket, "--remote", "--force",
      `--filename=${manifestPath}`,
      `--concurrency=${concurrency}`,
      `--content-type=${contentType}`,
      `--cache-control=${cacheControl}`,
    ], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolvePromise()
      : reject(new Error(`Cloudflare upload exited with code ${code}.`)));
  });

const allFiles = await collectFiles(root);
const catalogPath = join(root, "catalog.json");
const groups = [
  { name: "WebP tiles", extension: ".webp", contentType: "image/webp" },
  { name: "DZI descriptors", extension: ".dzi", contentType: "application/xml; charset=utf-8" },
  { name: "map manifests", extension: ".json", contentType: "application/json; charset=utf-8" },
].map((group) => ({
  ...group,
  files: allFiles.filter((file) => extname(file).toLowerCase() === group.extension && file !== catalogPath),
}));

if (resumeAt) {
  const webpGroup = groups.find(({ extension }) => extension === ".webp");
  const resumeIndex = webpGroup.files.findIndex((file) => relative(root, file).split(sep).join("/") === resumeAt);
  if (resumeIndex < 0) throw new Error(`Resume file was not found: ${resumeAt}`);
  webpGroup.files = webpGroup.files.slice(resumeIndex);
  console.log(`Resuming WebP upload at ${resumeAt} (${webpGroup.files.length} files remain).`);
}

let checkpoint = null;
try {
  checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
  if (checkpoint.prefix !== prefix) checkpoint = null;
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const waitForRequestWindow = async () => {
  console.log(`Waiting ${Math.ceil(requestWindowPauseMs / 1000)} seconds for the Cloudflare API window to reset.`);
  await new Promise((resolvePromise) => setTimeout(resolvePromise, requestWindowPauseMs));
};

const temporaryDirectory = await mkdtemp(join(tmpdir(), "pz-map-mod-cdn-"));
try {
  let requestsInWindow = 0;
  let checkpointReached = checkpoint === null;
  for (const [index, group] of groups.entries()) {
    if (group.files.length === 0) continue;
    if (!checkpointReached) {
      if (checkpoint.groupName !== group.name) {
        console.log(`Skipping completed group: ${group.name}`);
        continue;
      }
      checkpointReached = true;
    }
    const startOffset = checkpoint?.groupName === group.name ? checkpoint.nextOffset : 0;
    console.log(`Uploading ${group.files.length} files: ${group.name}`);
    for (let offset = startOffset; offset < group.files.length; offset += chunkSize) {
      const chunk = group.files.slice(offset, offset + chunkSize);
      if (requestsInWindow > 0 && requestsInWindow + chunk.length > requestWindowSize) {
        await waitForRequestWindow();
        requestsInWindow = 0;
      }
      const manifestPath = join(temporaryDirectory, `upload-${index}-${offset}.json`);
      await writeFile(manifestPath, JSON.stringify(chunk.map((file) => ({ key: toObjectKey(file), file }))), "utf8");
      let uploaded = false;
      for (let attempt = 1; attempt <= 4 && !uploaded; attempt += 1) {
        try {
          console.log(`Uploading ${group.name} ${offset + 1}-${offset + chunk.length}/${group.files.length} (attempt ${attempt}/4)`);
          await runWrangler(manifestPath, group.contentType);
          uploaded = true;
          requestsInWindow += chunk.length;
          await mkdir(resolve(checkpointPath, ".."), { recursive: true });
          await writeFile(checkpointPath, JSON.stringify({
            prefix,
            groupName: group.name,
            nextOffset: offset + chunk.length,
          }, null, 2), "utf8");
        } catch (error) {
          if (attempt === 4) throw error;
          console.warn("Chunk upload failed; retrying after the Cloudflare API window resets.", error);
          await waitForRequestWindow();
          requestsInWindow = 0;
        }
      }
    }
  }

  const catalogManifestPath = join(temporaryDirectory, "upload-catalog.json");
  await writeFile(catalogManifestPath, JSON.stringify([{ key: toObjectKey(catalogPath), file: catalogPath }]), "utf8");
  console.log("Uploading catalog last");
  await runWrangler(catalogManifestPath, "application/json; charset=utf-8", "no-cache");
  await rm(checkpointPath, { force: true });
  console.log(`Prepared map mods uploaded to r2://${bucket}/${prefix}/`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
