import { readdir, stat, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

const DEFAULT_ROOT = resolve("public/map-data/knox-country");
const DEFAULT_BASE_URL = "https://pz.ingredientassets.com/b42.20.2-r1/knox-country";
const EXPECTED_CONTENT_TYPES = new Map([
  [".json", "application/json"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".dzi", "application/xml"],
  [".bin", "application/octet-stream"],
  [".gz", "application/octet-stream"],
]);

const argumentsByName = new Map(process.argv.slice(2).map((argument) => {
  const [name, ...valueParts] = argument.replace(/^--/, "").split("=");
  return [name, valueParts.join("=")];
}));
const root = resolve(argumentsByName.get("root") || DEFAULT_ROOT);
const baseUrl = (argumentsByName.get("base-url") || DEFAULT_BASE_URL).replace(/\/+$/, "");
const concurrency = Number.parseInt(argumentsByName.get("concurrency") || "48", 10);
const profile = argumentsByName.get("profile") || "base";
const failureManifest = argumentsByName.get("failure-manifest");
const requestTimeoutMs = Number.parseInt(argumentsByName.get("timeout-ms") || "15000", 10);

if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Concurrency must be a positive integer.");

const collectFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : Promise.resolve([path]);
  }));
  return nested.flat();
};

const files = (profile === "mods"
  ? await collectFiles(root)
  : [
      join(root, "metadata.json"),
      ...await collectFiles(join(root, "locales")),
      ...await collectFiles(join(root, "icons")),
      ...await collectFiles(join(root, "tiles")),
      ...await collectFiles(join(root, "navigation")),
    ]
).filter((file) => EXPECTED_CONTENT_TYPES.has(extname(file).toLowerCase()));

let nextIndex = 0;
let verified = 0;
let processed = 0;
const failures = [];

const verifyFile = async (file) => {
  const objectPath = relative(root, file).split(sep).join("/");
  const url = `${baseUrl}/${objectPath}`;
  const response = await fetch(url, {
    method: "HEAD",
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: {
      Origin: "overwolf-extension://ckhekpnfipbaifohelbolknpbaoeiggehkfpkadg",
      "Accept-Encoding": "identity",
    },
  });
  const localSize = (await stat(file)).size;
  let remoteSize = Number.parseInt(response.headers.get("content-length") || "-1", 10);
  if (remoteSize < 0 && response.ok) {
    const rangeResponse = await fetch(url, {
      signal: AbortSignal.timeout(requestTimeoutMs),
      headers: {
        Origin: "overwolf-extension://ckhekpnfipbaifohelbolknpbaoeiggehkfpkadg",
        Range: "bytes=0-0",
        "Accept-Encoding": "identity",
      },
    });
    const contentRange = rangeResponse.headers.get("content-range");
    remoteSize = Number.parseInt(contentRange?.split("/").at(-1) || "-1", 10);
    await rangeResponse.body?.cancel();
  }
  const expectedType = EXPECTED_CONTENT_TYPES.get(extname(file).toLowerCase());
  const actualType = response.headers.get("content-type") || "";
  const corsOrigin = response.headers.get("access-control-allow-origin");
  if (!response.ok || remoteSize !== localSize || !actualType.startsWith(expectedType) || corsOrigin !== "*") {
    throw new Error(`${response.status}; size ${remoteSize}/${localSize}; type ${actualType}; CORS ${corsOrigin}`);
  }
};

const worker = async () => {
  while (nextIndex < files.length) {
    const index = nextIndex++;
    try {
      let lastError;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await verifyFile(files[index]);
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (lastError) throw lastError;
      verified += 1;
    } catch (error) {
      failures.push(`${relative(root, files[index])}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      processed += 1;
      if (processed % 500 === 0 || processed === files.length) {
        console.log(`Processed ${processed}/${files.length}; verified ${verified}; failed ${failures.length}`);
      }
    }
  }
};

await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));

if (failures.length > 0) {
  if (failureManifest) await writeFile(resolve(failureManifest), `${failures.join("\n")}\n`, "utf8");
  console.error(failures.slice(0, 25).join("\n"));
  throw new Error(`${failures.length} of ${files.length} CDN objects failed verification.`);
}

console.log(JSON.stringify({ baseUrl, verified }, null, 2));
