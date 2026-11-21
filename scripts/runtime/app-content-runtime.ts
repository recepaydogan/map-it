import { Sha256Js } from "@smithy/core/checksum";

type ContentEntry = [number, string];
interface ContentConfig {
  appId: string;
  baseUrl: string;
  urlSuffix?: string;
  files: Record<string, ContentEntry>;
  redirects: Record<string, string>;
  aliases: { origin: string; stripPrefix?: string; localPrefix?: string; releasePrefix?: boolean }[];
  prefetch: string[];
  virtualLocales: { path: string; packs: Record<string, string> } | null;
}
declare global {
  interface Window {
    __MAP_IT_APP__?: { id: string; prefix: string };
    __MAP_IT_CONTENT_CONFIG__?: ContentConfig;
    __MAP_IT_CONTENT__?: ReturnType<typeof createRuntime>;
  }
}

export function createRuntime(config: ContentConfig) {
  const fetchNative = globalThis.fetch.bind(globalThis);
  const prefix = `/apps/${config.appId}/`;
  const cacheName = `map-it-content-v1-${config.appId}`;
  const pending = new Map<string, Promise<Response>>();
  const inspectedCache = new Set<string>();
  let cachePromise: Promise<Cache | null> | undefined;
  const cache = () => cachePromise ??= (typeof caches === "undefined" ? Promise.resolve(null) : caches.open(cacheName).catch(() => null));
  const relative = (value: string) => {
    const url = new URL(value, location.href);
    if (url.origin === location.origin && url.pathname.startsWith(prefix)) return decodeURIComponent(url.pathname.slice(prefix.length));
    for (const alias of config.aliases) {
      if (url.origin !== alias.origin) continue;
      if (alias.releasePrefix) {
        const match = url.pathname.match(/^\/releases\/[a-f0-9]+\/(.*)$/);
        if (match) return decodeURIComponent(match[1]);
      } else if (alias.stripPrefix && url.pathname.startsWith(alias.stripPrefix)) return (alias.localPrefix || "") + decodeURIComponent(url.pathname.slice(alias.stripPrefix.length));
    }
    return null;
  };
  const remoteUrl = (file: string) => config.baseUrl + "/" + file.split("/").map(encodeURIComponent).join("/") + (config.urlSuffix || "");
  function resolveAsset(value: string | URL): string | URL {
    const file = relative(String(value));
    if (file === null) return value;
    if (config.redirects[file]) return new URL(config.redirects[file], location.href).href;
    return config.files[file] ? remoteUrl(file) : value;
  }
  async function sha256(bytes: ArrayBuffer): Promise<string> {
    if (globalThis.crypto?.subtle) {
      try { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join(""); }
      catch { /* Some native extension schemes do not expose WebCrypto. */ }
    }
    const hash = new Sha256Js(); const data = new Uint8Array(bytes);
    for (let offset = 0; offset < data.length; offset += 1024 * 1024) {
      hash.update(data.subarray(offset, offset + 1024 * 1024));
      if (data.length > 4 * 1024 * 1024) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return Array.from(await hash.digest(), byte => byte.toString(16).padStart(2, "0")).join("");
  }
  async function validate(response: Response, entry: ContentEntry): Promise<Response> {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== entry[0] || await sha256(bytes) !== entry[1]) throw new Error("Downloaded game content does not match its release.");
    const headers = new Headers(response.headers);
    headers.delete("content-encoding"); headers.delete("content-length");
    return new Response(bytes, { status: 200, headers });
  }
  async function load(file: string): Promise<Response> {
    const url = remoteUrl(file); const entry = config.files[file];
    if (!entry) throw new Error("Unknown game content resource.");
    const stored = await cache();
    try {
      const existing = await stored?.match(url);
      if (existing) {
        if (inspectedCache.has(url)) return existing;
        try { const checked = await validate(existing, entry); inspectedCache.add(url); return checked; }
        catch { await stored?.delete(url); }
      }
    } catch { /* A full/disabled disk cache must not prevent online use. */ }
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetchNative(url, { cache: attempt ? "reload" : "default", mode: "cors", signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error(`Game content request failed (${response.status}).`);
        const checked = await validate(response, entry);
        try { await stored?.put(url, checked.clone()); inspectedCache.add(url); } catch { /* Storage quota may be exhausted. */ }
        return checked;
      } catch (error) { lastError = error; }
    }
    throw lastError;
  }
  function request(file: string): Promise<Response> {
    let promise = pending.get(file);
    if (!promise) {
      promise = load(file).finally(() => pending.delete(file));
      pending.set(file, promise);
    }
    return promise.then(response => response.clone());
  }
  const localJson = async (url: string) => {
    const response = await fetchNative(url);
    if (!response.ok) throw new Error("Bundled game fallback is missing.");
    return response.json() as Promise<Record<string, unknown>>;
  };
  async function fetchContent(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const original = input instanceof Request ? input.url : String(input);
    if (config.appId === "wow-forever" && config.aliases.some(alias => original === alias.origin + "/locales/wow-forever/current.json")) {
      return new Response(JSON.stringify({ version: 1, fingerprint: config.baseUrl.split("/").at(-1) }), { headers: { "content-type": "application/json" } });
    }
    let file = relative(original);
    // Asset setters may have already resolved this immutable URL.
    if (file === null && config.baseUrl && original.startsWith(config.baseUrl + "/")) file = decodeURIComponent(new URL(original).pathname.slice(new URL(config.baseUrl).pathname.length + 1));
    const method = init?.method || (input instanceof Request ? input.method : "GET");
    if (method !== "GET") return fetchNative(input, init);
    if (file === config.virtualLocales?.path) {
      const english = await localJson(prefix + file);
      const translated = await Promise.all(Object.entries(config.virtualLocales.packs).map(async ([language, pack]) => {
        try { return [language, await (await request(pack)).json()] as const; }
        catch { return [language, {}] as const; }
      }));
      return new Response(JSON.stringify({ ...english, translations: Object.fromEntries(translated) }), { headers: { "content-type": "application/json" } });
    }
    if (file === null || !config.files[file]) return fetchNative(input instanceof Request ? new Request(resolveAsset(original), input) : resolveAsset(original), init);
    const signal = init?.signal || (input instanceof Request ? input.signal : undefined);
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
    if (!signal) return request(file);
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException("Request aborted", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
      request(file!).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  }
  const loadJson = async (file: string) => (await request(file)).json();
  if (new URLSearchParams(location.search).get("window") === "main") {
    const prefetch = async () => { for (const file of config.prefetch) { try { await request(file); } catch { /* Opening that section will offer its normal retry state. */ } } };
    setTimeout(() => { void prefetch(); }, 1200);
  }
  return { resolveAsset, fetchContent, loadJson };
}
const context = globalThis as unknown as Window;
if (context.__MAP_IT_CONTENT_CONFIG__) context.__MAP_IT_CONTENT__ = createRuntime(context.__MAP_IT_CONTENT_CONFIG__);
