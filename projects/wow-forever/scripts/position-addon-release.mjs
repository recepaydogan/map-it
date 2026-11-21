import { createHash } from "node:crypto";
import path from "node:path";
import { build } from "esbuild";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

let runtime;
export function loadPositionAddonRuntime() {
  runtime ??= build({
    stdin: { contents: `export * from './position-addon-package'; export { POSITION_ADDON_CONFIG as config } from './position-addon-config';`,
      resolveDir: path.resolve(import.meta.dirname, "./lib"), loader: "ts" },
    bundle: true, format: "esm", platform: "node", write: false,
  }).then(result => import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`));
  return runtime;
}

export async function preparePositionAddonRelease(source, version, interfaceVersion) {
  const { config, normalizeAddonText, verifyPositionAddonPackage } = await loadPositionAddonRuntime();
  const lua = `${normalizeAddonText(source).replace(/\nWFM_BRIDGE_VERSION = "[^"\r\n]*"\s*$/, "").trimEnd()}\n\nWFM_BRIDGE_VERSION = "${version}"\n`;
  if (!source.trim()) throw new Error("Addon source is empty");
  const serialized = JSON.stringify({ schemaVersion: 1, protocolVersion: config.protocolVersion, version, interfaceVersion, lua });
  const sha256 = createHash("sha256").update(serialized).digest("hex");
  return verifyPositionAddonPackage(serialized, sha256);
}

const fetchPublic = (url, fetcher) => fetcher(`${url}?verify=${Date.now()}`, {
  cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000), headers: { Origin: "http://127.0.0.1" },
});
const assertCors = response => {
  if (response.headers.get("access-control-allow-origin") !== "*") throw new Error("Addon CDN does not allow app CORS access");
};

export async function readPositionAddonChannel(baseUrl, fetcher = fetch) {
  const response = await fetchPublic(`${baseUrl}/current.json`, fetcher);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Addon channel: HTTP ${response.status}`);
  assertCors(response);
  const body = await response.text();
  const channel = JSON.parse(body);
  const { isAddonHash } = await loadPositionAddonRuntime();
  if (channel?.schemaVersion !== 1 || !isAddonHash(channel?.sha256)) throw new Error("Invalid existing addon channel");
  return { body, ...channel };
}

export async function readPositionAddonRelease(baseUrl, sha256, fetcher = fetch) {
  const { verifyPositionAddonPackage, isAddonHash } = await loadPositionAddonRuntime();
  if (!isAddonHash(sha256)) throw new Error("Invalid addon release hash");
  const response = await fetchPublic(`${baseUrl}/releases/${sha256}.json`, fetcher);
  if (!response.ok) throw new Error(`Addon release: HTTP ${response.status}`);
  assertCors(response);
  return verifyPositionAddonPackage(await response.text(), sha256);
}

/** Upload immutable bytes, verify through the public CDN, then switch the backed-up channel. */
export async function publishPositionAddonRelease(verified, { client, bucket, baseUrl, fetcher = fetch }) {
  const { config, verifyPositionAddonPackage } = await loadPositionAddonRuntime();
  if (baseUrl !== config.cdnBaseUrl) throw new Error("Unexpected addon CDN destination");
  await verifyPositionAddonPackage(verified.serialized, verified.sha256);
  const prefix = new URL(baseUrl).pathname.slice(1);
  const previous = await readPositionAddonChannel(baseUrl, fetcher);
  const put = (key, body, cacheControl) => client.send(new PutObjectCommand({
    Bucket: bucket, Key: `${prefix}/${key}`, Body: body,
    ContentType: "application/json; charset=utf-8", CacheControl: cacheControl,
  }));
  await put(`releases/${verified.sha256}.json`, verified.serialized, "public, max-age=31536000, immutable");
  await readPositionAddonRelease(baseUrl, verified.sha256, fetcher);
  if (previous?.sha256 === verified.sha256) return { sha256: verified.sha256, changed: false };
  if (previous) {
    const stamp = new Date().toISOString().replaceAll(":", "-");
    await put(`history/${stamp}-${previous.sha256}.json`, previous.body, "no-store");
  }
  const channel = JSON.stringify({ schemaVersion: 1, sha256: verified.sha256 });
  try {
    await put("current.json", channel, "no-store");
    const active = await readPositionAddonChannel(baseUrl, fetcher);
    if (active?.sha256 !== verified.sha256) throw new Error("Published addon channel did not verify");
  } catch (error) {
    // An old pointer is restored even when publication succeeded but CDN verification failed.
    if (previous) await put("current.json", previous.body, "no-store");
    else await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: `${prefix}/current.json` }));
    throw new Error("Addon channel publication failed; previous channel restored", { cause: error });
  }
  return { sha256: verified.sha256, changed: true };
}
