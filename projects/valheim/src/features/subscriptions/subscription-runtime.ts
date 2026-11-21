import { useEffect, useSyncExternalStore } from "react";
import { SUBSCRIPTION_CONFIG } from "./subscription-config";
import { IS_OVERWOLF, openExternalUrl } from "./subscription-platform";
import { createSubscriptionController } from "./subscription-controller";
import { SUBSCRIPTION_CALLBACK_KEY } from "./subscription-callback";
import { createSubscriberLedgerSync } from "./subscriber-sync";

export const SUBSCRIPTIONS_ENABLED = IS_OVERWOLF && Boolean(import.meta.env.VITE_TEBEX_PUBLIC_TOKEN);
const API_TIMEOUT = 30_000;
const callback = <T>(invoke: (resolve: (value: T) => void) => void): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("overwolf-timeout")), API_TIMEOUT);
  try { invoke(value => { clearTimeout(timer); resolve(value); }); }
  catch { clearTimeout(timer); reject(new Error("overwolf-unavailable")); }
});

export const subscriptions = createSubscriptionController({
  storeToken: import.meta.env.VITE_TEBEX_PUBLIC_TOKEN ?? "",
  packageIds: Object.values(SUBSCRIPTION_CONFIG.premiumPackageIds),
  packageTiers: Object.fromEntries(Object.entries(SUBSCRIPTION_CONFIG.premiumPackageIds).map(([key, id]) =>
    [id, SUBSCRIPTION_CONFIG.premiumPackageTiers[key as keyof typeof SUBSCRIPTION_CONFIG.premiumPackageTiers]])),
  getIdentity: async () => {
    if (!IS_OVERWOLF || !SUBSCRIPTIONS_ENABLED) return null;
    const user = await callback<overwolf.profile.GetCurrentUserResult>(resolve => overwolf.profile.getCurrentUser(resolve));
    if (!user.success || !user.uuid) return null;
    const manifest = await callback<overwolf.extensions.GetManifestResult>(resolve => overwolf.extensions.current.getManifest(resolve));
    if (!manifest.success || !manifest.UID) throw new Error("extension-id-unavailable");
    return { uuid: user.uuid, name: user.username || user.displayName || user.uuid, extensionId: manifest.UID };
  },
  getToken: async () => {
    const result = await callback<overwolf.profile.GenerateUserSessionTokenResult>(resolve => overwolf.profile.generateUserSessionToken(resolve));
    if (!result.success || !result.token) throw new Error("overwolf-login-required");
    return result.token;
  },
  request: async (url, token) => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), API_TIMEOUT);
    try {
      const response = await fetch(url, { signal: abort.signal, cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!response.ok) throw new Error(`http-${response.status}`);
      return await response.json();
    } catch (error) {
      if (error instanceof Error && /^http-\d+$/.test(error.message)) throw error;
      throw new Error("network-or-response-error");
    } finally { clearTimeout(timer); }
  },
  openCheckout: openExternalUrl,
  syncSubscriber: createSubscriberLedgerSync(async (identity, token) => {
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!baseUrl || import.meta.env.VITE_SUBSCRIBER_LEDGER_ENABLED !== 'true') return;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 30_000);
    try {
      const response = await fetch(`${baseUrl}/functions/v1/sync-premium-subscriber`, {
        method: "POST", signal: abort.signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        // Status, UUID and email are never accepted from the client by the server.
        body: JSON.stringify({ extensionId: identity.extensionId }),
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error("subscriber-sync-failed");
    } finally { clearTimeout(timer); }
  }),
});

/** One lifecycle per dashboard window; state is independently verified in each window. */
export function useSubscriptionLifecycle() {
  useEffect(() => {
    if (!IS_OVERWOLF || !SUBSCRIPTIONS_ENABLED) return;
    let nextRegularCheck = 0;
    let checkoutStartedAt = 0;
    const refresh = () => { void subscriptions.refresh(); };
    const loginChanged = () => { subscriptions.invalidate(); refresh(); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    const returned = (event: StorageEvent) => {
      if (event.key !== SUBSCRIPTION_CALLBACK_KEY || !event.newValue) return;
      try {
        const { result } = JSON.parse(event.newValue);
        if (result === "cancel") subscriptions.finishCheckout();
        if (result === "success" || result === "cancel") refresh();
      } catch { /* Invalid refresh signals carry no authority. */ }
    };
    const timer = window.setInterval(() => {
      const pending = subscriptions.getSnapshot().checkoutPending;
      if (pending && !checkoutStartedAt) checkoutStartedAt = Date.now();
      if (!pending) checkoutStartedAt = 0;
      if (checkoutStartedAt && Date.now() - checkoutStartedAt > 120_000) {
        subscriptions.finishCheckout();
        checkoutStartedAt = 0;
      }
      if (pending || Date.now() >= nextRegularCheck) {
        nextRegularCheck = Date.now() + 30_000;
        refresh();
      }
    }, 3_000);
    refresh();
    overwolf.profile.onLoginStateChanged.addListener(loginChanged);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", returned);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      overwolf.profile.onLoginStateChanged.removeListener(loginChanged);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", returned);
      document.removeEventListener("visibilitychange", visible);
      subscriptions.invalidate();
    };
  }, []);
}
export const useSubscription = () => useSyncExternalStore(subscriptions.subscribe, subscriptions.getSnapshot, subscriptions.getSnapshot);
