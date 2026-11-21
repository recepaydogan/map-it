import { createTebexWebhook } from "./webhook.ts";

const secret = Deno.env.get("TEBEX_WEBHOOK_SECRET")?.trim();
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ids = Deno.env.get("TEBEX_PREMIUM_PACKAGE_IDS")?.split(",").map(id => Number(id.trim())) ?? [];

if (!secret || !supabaseUrl || !serviceRole || !ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
  throw new Error("Tebex subscriber webhook is missing server configuration");
}

Deno.serve(createTebexWebhook({
  secret,
  packageIds: new Set(ids),
  save: async rows => {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/apply_tebex_subscriber_event`, {
      method: "POST",
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_rows: rows }),
      signal: AbortSignal.timeout(8000),
    });
    await response.body?.cancel();
    if (!response.ok) {
      console.error("Subscriber ledger write failed", response.status);
      throw new Error("subscriber-write-failed");
    }
  },
}));
