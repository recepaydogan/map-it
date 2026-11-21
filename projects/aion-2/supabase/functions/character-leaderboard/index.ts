import { adminClient, loadStoredProfile, readIdentity } from "../_shared/character-profiles.ts";
import { CHARACTER_PROFILE_CONFIG } from "../../../src/game-config.ts";

declare const Deno: {
  serve: (handler: (request: Request) => Promise<Response> | Response) => void;
  env: { get: (key: string) => string | undefined };
};
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
  "Content-Type": "application/json; charset=utf-8",
};

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { ...headers, "Cache-Control": "no-store" } });
const errorResponse = (status: number, error: string): Response => json({ error }, status);
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const admin = adminClient();
  if (!admin) return errorResponse(503, "leaderboard-unavailable");

  if (request.method === "POST" && new URL(request.url).pathname.endsWith("/refresh")) {
    const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return errorResponse(401, "sign-in-required");
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return errorResponse(401, "sign-in-required");

    let body: unknown;
    try {
      const text = await request.text();
      if (text.length > 1024) return errorResponse(413, "invalid-character");
      body = JSON.parse(text);
    } catch {
      return errorResponse(400, "invalid-character");
    }
    const identity = readIdentity(body);
    if (!identity) return errorResponse(400, "invalid-character");
    const { data: linked, error: linkedError } = await admin.from("user_characters")
      .select("character_id").eq("user_id", authData.user.id)
      .eq("region", identity.region).eq("server_id", identity.serverId)
      .eq("character_id", identity.characterId).maybeSingle();
    if (linkedError) {
      console.error("Could not verify linked leaderboard character", linkedError);
      return errorResponse(503, "leaderboard-unavailable");
    }
    if (!linked) return errorResponse(403, "character-not-linked");
    try {
      await loadStoredProfile(admin, identity);
      return json({ updated: true });
    } catch (error) {
      console.error("Could not refresh linked leaderboard character", error);
      return errorResponse(503, "leaderboard-unavailable");
    }
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    const region = url.searchParams.get("region");
    const serverId = url.searchParams.get("serverId");
    const query = url.searchParams.get("query")?.trim() ?? "";
    const offset = Number(url.searchParams.get("offset") ?? "0");
    if (region && !CHARACTER_PROFILE_CONFIG.regions.some((value) => value === region)
      || serverId && (!region || !/^\d{4}$/.test(serverId))
      || query.length > 80 || !Number.isInteger(offset) || offset < 0 || offset > 10000) {
      return errorResponse(400, "invalid-filter");
    }
    if (url.searchParams.get("mine") === "1") {
      const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
      if (!token) return errorResponse(401, "sign-in-required");
      const { data: authData, error: authError } = await admin.auth.getUser(token);
      if (authError || !authData.user) return errorResponse(401, "sign-in-required");
      const { data: mine, error: mineError } = await admin.rpc("character_leaderboard_my_entry", {
        p_user_id: authData.user.id,
        p_region: region || null,
        p_server_id: serverId ? Number(serverId) : null,
        p_query: query || null,
      });
      if (mineError) {
        console.error("Could not load personal leaderboard entry", mineError);
        return errorResponse(503, "leaderboard-unavailable");
      }
      return json({ entries: Array.isArray(mine) ? mine : [] });
    }
    const [pageResult, remainingResult] = await Promise.all([
      admin.rpc("character_leaderboard_page", {
        p_region: region || null,
        p_server_id: serverId ? Number(serverId) : null,
        p_query: query || null,
        p_offset: offset,
        p_limit: 25,
      }),
      admin.rpc("character_leaderboard_seed_remaining"),
    ]);
    if (pageResult.error || remainingResult.error) {
      console.error("Could not load leaderboard page", pageResult.error ?? remainingResult.error);
      return errorResponse(503, "leaderboard-unavailable");
    }
    const { data } = pageResult;
    const syncing = remainingResult.data === true;
    const value = { entries: data ?? [], total: data?.[0]?.total ?? 0, syncing };
    return json(value);
  }
  return errorResponse(405, "method-not-allowed");
});
