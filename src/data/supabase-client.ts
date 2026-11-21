/**
 * Lazy Supabase client. The app must boot (and the map must work) even when
 * Supabase is not configured or unreachable — callers treat a null client as
 * "accounts unavailable" and the rest of the app keeps running signed-out.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSharedAccountConfig } from "../services/auth/shared-account-config";

const { url: supabaseUrl, key: supabaseAnonKey } = getSharedAccountConfig();

let client: SupabaseClient | null | undefined;

export const getSupabaseClient = (): SupabaseClient | null => {
  if (client !== undefined) return client;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      "[Supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — account features disabled.",
    );
    client = null;
    return client;
  }

  try { client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      storageKey: getSharedAccountConfig().storageKey,
      autoRefreshToken: true,
      // Password recovery uses an in-app code instead of a URL callback.
      detectSessionInUrl: false,
    },
  }); } catch {
    console.warn("[Map It] Account settings are unavailable; maps remain accessible.");
    client = null;
  }
  return client;
};
