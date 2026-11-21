import { getSupabaseClient } from "../../data/supabase-client";

/** The signed-in account id, or null when signed out / unavailable. */
export const accountUserId = async (): Promise<string | null> => {
  const client = getSupabaseClient();
  if (!client) return null;
  // This is a client-side hint; every RPC enforces authorization on the server.
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session?.user.id ?? null;
};

/* ── Device token ──────────────────────────────────────────────────────────── */

/** Where this device's support identity lives. Losing it (cleared storage, new
 *  machine) means losing access to threads that were never claimed by an
 *  account — which is the honest cost of not requiring one. */
const TOKEN_KEY = "elden-ring-atlas:support-token";

/** uuid v4 without depending on crypto.randomUUID (secure-context only). */
const randomUuid = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/** The token for this device, minted on first use. */
export const deviceToken = (): string => {
  try {
    const stored = window.localStorage.getItem(TOKEN_KEY);
    if (stored) return stored;
    const minted = randomUuid();
    window.localStorage.setItem(TOKEN_KEY, minted);
    return minted;
  } catch {
    // Storage disabled: support still works for this run, but the conversation
    // can't be found again from this device.
    return randomUuid();
  }
};

