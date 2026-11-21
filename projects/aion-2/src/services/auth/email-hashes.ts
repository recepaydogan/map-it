import { onAuthChange } from "./auth-service";

/** Run once in the background window so all UI windows share one identity. */
export const startEmailHashSync = (): (() => void) => {
  if (typeof overwolf === "undefined") return () => {};
  const api = overwolf.extensions?.current;
  if (!api?.generateUserEmailHashes || !api.setUserEmailHashes) {
    console.warn("[EmailHashes] Overwolf email identity API is unavailable.");
    return () => {};
  }

  let disposed = false;
  let pending = false;
  let requested: string | null | undefined;
  let applied: string | null | undefined;

  const sync = () => {
    if (disposed || pending || requested === undefined || requested === applied) return;
    const email = requested;
    pending = true;

    const complete = (success: boolean) => {
      pending = false;
      if (success) applied = email;
      else {
        // Never log the email, hashes, or API error payload (which can echo input).
        console.warn("[EmailHashes] Overwolf email identity update failed.");
      }
      // Serialize writes: a slow sign-in must not overwrite a later sign-out.
      // Failed writes can be retried by the next auth event without a retry loop.
      if (requested !== email) sync();
    };

    try {
      if (email) {
        // Overwolf performs normalization and hashing and stores only the hashes.
        api.generateUserEmailHashes(email, (result) => complete(result.success));
      } else {
        // The documented clear operation accepts {}, but the SDK types require
        // every hash field. Keep this compatibility assertion at the API boundary.
        api.setUserEmailHashes({} as overwolf.extensions.current.UserEmailHashes,
          (result) => complete(result.success));
      }
    } catch {
      complete(false);
    }
  };

  // Supabase emits INITIAL_SESSION after restoring storage, then sign-in/out,
  // account updates, and auth changes broadcast by the other app windows.
  const unsubscribe = onAuthChange((user) => {
    requested = user?.email.trim() || null;
    sync();
  });

  return () => {
    disposed = true;
    unsubscribe();
  };
};
