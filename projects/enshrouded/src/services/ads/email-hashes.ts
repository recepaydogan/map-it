const CONSENT_PREFIX = "enshrouded:ad-email-hashes:";
export const EMAIL_HASH_CONSENT_CHANGED = "ad-email-hash-consent-changed";

export const hasEmailHashConsent = (userId: string): boolean => {
  try {
    return window.localStorage.getItem(`${CONSENT_PREFIX}${userId}`) === "true";
  } catch {
    return false;
  }
};

export const setEmailHashConsent = (userId: string, enabled: boolean): void => {
  try {
    window.localStorage.setItem(`${CONSENT_PREFIX}${userId}`, String(enabled));
    window.dispatchEvent(new Event(EMAIL_HASH_CONSENT_CHANGED));
  } catch (error) {
    console.warn("[Ads] Could not save email hash preference", error);
  }
};

let pendingEmail: string | null | undefined;
let requestInFlight = false;
let appliedEmail: string | null | undefined;

const flushEmailHashes = (): void => {
  if (requestInFlight || pendingEmail === undefined) return;
  const api = typeof overwolf === "undefined" ? undefined : overwolf.extensions?.current;
  if (!api?.generateUserEmailHashes || !api?.setUserEmailHashes) return;

  const email = pendingEmail;
  pendingEmail = undefined;
  if (email === appliedEmail) return;
  requestInFlight = true;
  const complete = (result: overwolf.Result) => {
    requestInFlight = false;
    if (result.success) {
      appliedEmail = email;
    } else {
      console.warn("[Ads] Could not update Overwolf email hashes", result.error);
    }
    flushEmailHashes();
  };

  if (email) api.generateUserEmailHashes(email, complete);
  // Overwolf documents {} as the clear operation; its TypeScript type omits it.
  else api.setUserEmailHashes({} as overwolf.extensions.current.UserEmailHashes, complete);
};

/** Supply an account email only after its owner opts in. Null clears persisted hashes. */
export const syncUserEmailHashes = (email: string | null): void => {
  pendingEmail = email?.trim() || null;
  flushEmailHashes();
};
