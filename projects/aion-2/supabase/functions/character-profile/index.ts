import { CHARACTER_PROFILE_CONFIG } from "../../../src/game-config.ts";
import { adminClient, loadStoredProfile, ProfileUnavailable, readIdentity } from "../_shared/character-profiles.ts";

declare const Deno: {
  serve: (handler: (request: Request) => Promise<Response> | Response) => void;
};

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
  "Content-Type": "application/json; charset=utf-8",
};

const cache = new Map<string, { body: string; expiresAt: number }>();
const cacheMs = 30_000;

const errorResponse = (status: number, error: string): Response =>
  new Response(JSON.stringify({ error }), { status, headers: responseHeaders });

const isRegion = (value: string | null): value is typeof CHARACTER_PROFILE_CONFIG.regions[number] =>
  CHARACTER_PROFILE_CONFIG.regions.some((region) => region === value);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders });
  if (request.method !== "GET") return errorResponse(405, "method-not-allowed");

  const url = new URL(request.url);
  const action = url.pathname.split("/").at(-1);
  const region = url.searchParams.get("region");
  const cacheBuster = url.searchParams.get("_t");
  if (!isRegion(region)) return errorResponse(400, "invalid-region");
  if (cacheBuster && !/^\d{13}$/.test(cacheBuster)) return errorResponse(400, "invalid-cache-buster");

  let upstream: URL;
  if (action === "servers") {
    upstream = new URL(CHARACTER_PROFILE_CONFIG.serversUrl);
    upstream.searchParams.set("lang", CHARACTER_PROFILE_CONFIG.locale);
    upstream.searchParams.set("region", region);
  } else if (action === "search") {
    const keyword = url.searchParams.get("keyword")?.trim() ?? "";
    const page = url.searchParams.get("page") ?? "1";
    const serverId = url.searchParams.get("serverId");
    if (keyword.length < 2 || keyword.length > 40) return errorResponse(400, "invalid-keyword");
    if (!/^[1-9]\d{0,3}$/.test(page) || Number(page) > 1000) return errorResponse(400, "invalid-page");
    if (serverId && !/^\d{4}$/.test(serverId)) return errorResponse(400, "invalid-server");
    upstream = new URL(CHARACTER_PROFILE_CONFIG.searchUrl);
    upstream.searchParams.set("keyword", keyword);
    upstream.searchParams.set("page", page);
    upstream.searchParams.set("size", String(CHARACTER_PROFILE_CONFIG.searchPageSize));
    upstream.searchParams.set("localeInfo", CHARACTER_PROFILE_CONFIG.locale);
    upstream.searchParams.set("region", region);
    if (serverId) upstream.searchParams.set("serverId", serverId);
    if (cacheBuster) upstream.searchParams.set("_t", cacheBuster);
  } else if (action === "info" || action === "equipment" || action === "snapshot") {
    const characterId = url.searchParams.get("characterId") ?? "";
    const serverId = url.searchParams.get("serverId") ?? "";
    if (!/^[A-Za-z0-9_-]{20,100}={0,2}$/.test(characterId) || !/^\d{4}$/.test(serverId)) {
      return errorResponse(400, "invalid-character");
    }
    const identity = readIdentity({ characterId, serverId: Number(serverId), region });
    if (!identity) return errorResponse(400, "invalid-character");
    const admin = adminClient();
    if (!admin) return errorResponse(503, "profile-store-unavailable");
    try {
      const stored = await loadStoredProfile(admin, identity);
      // Keep the raw response shapes for installed clients. The new endpoint
      // reads both halves atomically and removes the extra client request.
      return Response.json(action === "snapshot" ? stored.snapshot : stored[action], {
        headers: { ...responseHeaders, "Cache-Control": "no-store", "Last-Modified": new Date(stored.checkedAt).toUTCString() },
      });
    } catch (error) {
      console.error("Could not load stored character profile", error);
      return new Response(JSON.stringify({ error: "profile-unavailable" }), {
        status: 503,
        headers: { ...responseHeaders, "Cache-Control": "no-store", "Retry-After": String(error instanceof ProfileUnavailable ? error.retryAfter : 60) },
      });
    }
  } else {
    return errorResponse(404, "unknown-action");
  }

  const key = upstream.toString();
  const cached = cacheBuster ? undefined : cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return new Response(cached.body, { headers: { ...responseHeaders, "Cache-Control": "public, max-age=30" } });
  }

  try {
    const response = await fetch(upstream, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return errorResponse(response.status, `upstream-${response.status}`);
    const body = await response.text();
    if (!cacheBuster) {
      if (cache.size >= 100) cache.clear();
      cache.set(key, { body, expiresAt: Date.now() + cacheMs });
    }
    return new Response(body, { headers: { ...responseHeaders, "Cache-Control": cacheBuster ? "no-store" : "public, max-age=30" } });
  } catch (error) {
    console.error("Character profile upstream request failed", error);
    return errorResponse(502, "upstream-unavailable");
  }
});
