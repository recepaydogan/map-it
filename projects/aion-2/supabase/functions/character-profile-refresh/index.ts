import { adminClient, ProfileUnavailable, refreshNextProfile } from "../_shared/character-profiles.ts";

declare const Deno: {
  serve: (handler: (request: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const secret = Deno.env.get("CHARACTER_PROFILE_REFRESH_SECRET");
  if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }
  const admin = adminClient();
  if (!admin) return new Response(null, { status: 503 });
  const deadline = Date.now() + 40_000;
  let refreshed = 0;
  let unavailable = 0;
  try {
    while (Date.now() < deadline) {
      try {
        if (!await refreshNextProfile(admin)) break;
        refreshed += 1;
      } catch (error) {
        if (!(error instanceof ProfileUnavailable) || ![400, 403, 404].includes(error.status)) throw error;
        console.warn("Official profile is unavailable; its retry is queued", error.status);
        unavailable += 1;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 2100));
    }
    return Response.json({ refreshed, unavailable });
  } catch (error) {
    console.error("Scheduled character refresh failed; the queue retains its retry time", error);
    return Response.json({ refreshed, error: "refresh-deferred" }, { status: 503 });
  }
});
