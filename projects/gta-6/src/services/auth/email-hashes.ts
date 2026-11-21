import { getSupabaseClient } from "../../data/supabase-client";

type HashResult = { success: boolean };
interface EmailHashApi {
  generateUserEmailHashes(email: string, callback: (result: HashResult) => void): void;
  // Overwolf documents {} as the clearing operation, but its typings require all hashes.
  setUserEmailHashes(hashes: Partial<overwolf.extensions.current.UserEmailHashes>, callback: (result: HashResult) => void): void;
}

/** Owned by the background window, so desktop and overlay do not race each other.
 * Supabase emits INITIAL_SESSION after restoring storage, then all account changes.
 * Overwolf owns normalization, hashing and the user's personalization opt-out. */
export const startEmailHashSync = (): (() => void) => {
  const api: EmailHashApi | undefined = typeof overwolf === "undefined"
    ? undefined : overwolf.extensions?.current;
  if (!api?.generateUserEmailHashes || !api.setUserEmailHashes) return () => {};
  const client = getSupabaseClient();
  if (!client) return () => {};

  let disposed = false;
  let desired: string | null | undefined;
  let applied: string | null | undefined;
  let running = false;

  const sync = () => {
    if (disposed || running || desired === undefined || desired === applied) return;
    const email = desired;
    running = true;
    const complete = (result: HashResult) => {
      running = false;
      if (result.success) applied = email;
      else console.warn("[Email hashes] Overwolf identity update failed; a later auth event can retry.");
      // Serialize account changes: a late sign-in callback must not overwrite sign-out.
      if (desired !== email) sync();
    };
    try {
      if (email) api.generateUserEmailHashes(email, complete);
      else api.setUserEmailHashes({}, complete);
    } catch {
      complete({ success: false });
    }
  };

  const { data } = client.auth.onAuthStateChange((_event, session) => {
    desired = session?.user.email?.trim() || null;
    sync();
  });
  return () => {
    disposed = true;
    data.subscription.unsubscribe();
  };
};
