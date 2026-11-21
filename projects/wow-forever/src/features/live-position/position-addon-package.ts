import { POSITION_ADDON_CONFIG as config } from "../../game-config";

export const ADDON_CACHE_KEY = "wfm:position-addon:verified:v1";
export const MAX_ADDON_PACKAGE_BYTES = 256 * 1024;
export const normalizeAddonText = (value: string) => value.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
export const isAddonHash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export interface PositionAddonPackage {
  schemaVersion: 1;
  protocolVersion: number;
  version: string;
  interfaceVersion: number;
  lua: string;
}
export interface VerifiedAddonPackage {
  sha256: string;
  serialized: string;
  addon: PositionAddonPackage;
}

export const addonSha256 = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** Neither the channel nor the payload may choose a filesystem path or executable. */
export const verifyPositionAddonPackage = async (serialized: string, sha256: unknown): Promise<VerifiedAddonPackage> => {
  if (!isAddonHash(sha256) || new TextEncoder().encode(serialized).length > MAX_ADDON_PACKAGE_BYTES ||
      await addonSha256(serialized) !== sha256) throw new Error("Addon package integrity check failed");
  const addon = JSON.parse(serialized) as PositionAddonPackage;
  if (!addon || addon.schemaVersion !== 1 || addon.protocolVersion !== config.protocolVersion ||
      typeof addon.version !== "string" || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(addon.version) ||
      !Number.isSafeInteger(addon.interfaceVersion) || addon.interfaceVersion < 1 || addon.interfaceVersion > 999999 ||
      typeof addon.lua !== "string" || !addon.lua.trim() || addon.lua.includes("\0") ||
      normalizeAddonText(addon.lua) !== addon.lua) throw new Error("Invalid or incompatible addon package");
  return { sha256, serialized, addon };
};

const fetchText = async (url: string): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.downloadTimeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store", redirect: "error" });
    if (!response.ok || !response.body) throw new Error(`Addon CDN: HTTP ${response.status}`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ADDON_PACKAGE_BYTES) {
        await reader.cancel();
        throw new Error("Addon CDN response is too large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally { clearTimeout(timeout); }
};

export const readCachedPositionAddon = async (): Promise<VerifiedAddonPackage | null> => {
  try {
    const cached = JSON.parse(localStorage.getItem(ADDON_CACHE_KEY) ?? "null") as VerifiedAddonPackage | null;
    return cached && typeof cached.serialized === "string"
      ? await verifyPositionAddonPackage(cached.serialized, cached.sha256) : null;
  } catch { return null; }
};

/** Cache is committed by the installer only after successful file-write callbacks. */
export const downloadPositionAddon = async (): Promise<VerifiedAddonPackage> => {
  const channel = JSON.parse(await fetchText(`${config.cdnBaseUrl}/current.json?t=${Date.now()}`)) as {
    schemaVersion?: number; sha256?: unknown;
  } | null;
  if (!channel || channel.schemaVersion !== 1 || !isAddonHash(channel.sha256)) throw new Error("Invalid addon channel");
  const cached = await readCachedPositionAddon();
  if (cached?.sha256 === channel.sha256) return cached;
  const serialized = await fetchText(`${config.cdnBaseUrl}/releases/${channel.sha256}.json`);
  return verifyPositionAddonPackage(serialized, channel.sha256);
};
