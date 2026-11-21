export interface SubscriptionIdentity { uuid: string; name: string; extensionId: string }
export interface SubscriptionPackage {
  id: number;
  type: string;
  price?: number;
  currency?: string;
}
export interface SubscriptionRecord { userId: string; packageId: number; state: string; recurringPaymentId?: string }
export interface SubscriptionSnapshot {
  status: "loading" | "signed-out" | "ready" | "error";
  identity: SubscriptionIdentity | null;
  packages: SubscriptionPackage[];
  subscriptions: SubscriptionRecord[];
  premium: boolean;
  activeSubscription: SubscriptionRecord | null;
  activeTier: number | null;
  checking: boolean;
  checkoutPending: boolean;
  checkedAt: number | null;
  error: string | null;
}
export interface SubscriptionDependencies {
  storeToken: string;
  packageIds: readonly number[];
  packageTiers?: Readonly<Record<number, number>>;
  getIdentity: () => Promise<SubscriptionIdentity | null>;
  getToken: () => Promise<string>;
  request: (url: string, token?: string) => Promise<unknown>;
  openCheckout: (url: string) => void;
  syncSubscriber?: (identity: SubscriptionIdentity, token: string, records: SubscriptionRecord[], force: boolean) => Promise<void>;
}
const ACTIVE_STATES = new Set(["ACTIVE", "PENDING_CANCELLATION"]);
const API = "https://subscriptions-api.overwolf.com";
const CHECK_TIMEOUT = 90_000;
const empty = (): SubscriptionSnapshot => ({ status: "loading", identity: null, packages: [], subscriptions: [],
  premium: false, activeSubscription: null, activeTier: null, checking: false, checkoutPending: false, checkedAt: null, error: null });

export function selectEffectiveSubscription(records: SubscriptionRecord[], packageIds: readonly number[], tiers: Readonly<Record<number, number>> = {}) {
  return records.filter(record => packageIds.includes(record.packageId) && ACTIVE_STATES.has(record.state))
    .sort((a, b) => (tiers[b.packageId] ?? 1) - (tiers[a.packageId] ?? 1)
      || Number(b.state === "ACTIVE") - Number(a.state === "ACTIVE")
      || a.packageId - b.packageId
      || (a.recurringPaymentId ?? "").localeCompare(b.recurringPaymentId ?? ""))[0] ?? null;
}

function packagesFrom(value: unknown): SubscriptionPackage[] {
  if (!Array.isArray(value)) throw new Error("invalid-response");
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || !("id" in item) || !("type" in item) ||
        !Number.isSafeInteger(item.id) || typeof item.type !== "string") throw new Error("invalid-response");
    const price = "base_price" in item && typeof item.base_price === "number" && Number.isFinite(item.base_price) && item.base_price >= 0 ? item.base_price : undefined;
    const currency = "currency" in item && typeof item.currency === "string" && /^[A-Z]{3}$/.test(item.currency) ? item.currency : undefined;
    return { id: item.id as number, type: item.type, price, currency };
  });
}
function subscriptionsFrom(value: unknown): SubscriptionRecord[] {
  if (!Array.isArray(value)) throw new Error("invalid-response");
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || !("packageId" in item) || !("userId" in item) || !("state" in item) ||
        !Number.isSafeInteger(item.packageId) || typeof item.userId !== "string" || typeof item.state !== "string") throw new Error("invalid-response");
    return { packageId: item.packageId as number, userId: item.userId, state: item.state,
      recurringPaymentId: "recurringPaymentId" in item && typeof item.recurringPaymentId === "string" ? item.recurringPaymentId : undefined };
  });
}

/** Entitlements live only in memory and only originate in an authenticated API response. */
export function createSubscriptionController(deps: SubscriptionDependencies) {
  let state = empty();
  let generation = 0;
  let inFlight: Promise<void> | null = null;
  let cancelRefresh: (() => void) | null = null;
  let buying = false;
  let forceNextSync = true;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<SubscriptionSnapshot>) => {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  };
  const endpoint = (path: string, extensionId: string) => {
    const url = new URL(`${API}/${path}/${encodeURIComponent(deps.storeToken)}`);
    url.searchParams.set("extensionId", extensionId);
    return url.toString();
  };
  const refresh = (options?: { forceSync?: boolean }): Promise<void> => {
    if (options?.forceSync) forceNextSync = true;
    if (inFlight) return inFlight;
    const current = generation;
    let expired = false;
    const isCurrent = () => current === generation && !expired;
    set({ checking: true, error: null });
    let timeout: ReturnType<typeof setTimeout>;
    const deadline = new Promise<void>(resolve => {
      timeout = setTimeout(() => {
        if (isCurrent()) {
          expired = true;
          set({ status: "error", premium: false, activeSubscription: null, activeTier: null,
            packages: [], subscriptions: [], checking: false, error: "subscription-check-timeout" });
        }
        resolve();
      }, CHECK_TIMEOUT);
      cancelRefresh = () => { expired = true; clearTimeout(timeout); resolve(); };
    });
    const work = (async () => {
      try {
        const identity = await deps.getIdentity();
        if (!isCurrent()) return;
        if (!identity) { set({ ...empty(), status: "signed-out" }); return; }
        if (state.identity?.uuid !== identity.uuid) set({ ...empty(), identity, checking: true });
        const token = await deps.getToken();
        if (!isCurrent()) return;
        const [rawPackages, rawSubscriptions] = await Promise.all([
          deps.request(endpoint("packages", identity.extensionId)),
          deps.request(endpoint("subscriptions", identity.extensionId), token),
        ]);
        if (!isCurrent()) return;
        // Recheck identity after the request, even if a login event was missed.
        const latestIdentity = await deps.getIdentity();
        if (!isCurrent()) return;
        if (latestIdentity?.uuid !== identity.uuid) { set({ ...empty(), status: "signed-out" }); return; }
        const packages = packagesFrom(rawPackages).filter(p => deps.packageIds.includes(p.id) && (p.type === "subscription" || p.type === "single"));
        const subscriptions = subscriptionsFrom(rawSubscriptions).filter(s => s.userId === identity.uuid && deps.packageIds.includes(s.packageId));
        const activeSubscription = selectEffectiveSubscription(subscriptions, deps.packageIds, deps.packageTiers);
        const premium = activeSubscription !== null;
        const activeTier = activeSubscription ? deps.packageTiers?.[activeSubscription.packageId] ?? 1 : null;
        set({ status: "ready", identity, packages, subscriptions, premium, activeSubscription, activeTier, checkedAt: Date.now(), error: null,
          checkoutPending: premium ? false : state.checkoutPending });
        // Persistence is best effort and must never delay checkout or change entitlement.
        if (deps.syncSubscriber) {
          void Promise.resolve().then(() => {
            if (!isCurrent()) return;
            const force = forceNextSync;
            forceNextSync = false;
            return deps.syncSubscriber?.(identity, token, subscriptions, force);
          }).catch(() => undefined);
        }
      } catch (error) {
        if (isCurrent()) set({ status: "error", premium: false, activeSubscription: null, activeTier: null, packages: [], subscriptions: [],
          error: error instanceof Error ? error.message : "request-failed" });
      } finally {
        if (isCurrent()) set({ checking: false });
      }
    })();
    // Bound the whole check, including sequential identity and token calls.
    const task = Promise.race([work, deadline]).finally(() => {
      clearTimeout(timeout);
      if (inFlight === task) { inFlight = null; cancelRefresh = null; }
    });
    inFlight = task;
    return task;
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh,
    invalidate: () => {
      generation++;
      cancelRefresh?.();
      cancelRefresh = null;
      inFlight = null;
      buying = false;
      forceNextSync = true;
      set(empty());
    },
    finishCheckout: () => set({ checkoutPending: false }),
    purchase: async (packageId: number) => {
      if (buying) return;
      buying = true;
      const current = generation;
      try {
        // A recent server check prevents purchases using stale login/subscription state.
        await refresh();
        if (current !== generation || state.status !== "ready" || !state.identity || state.checking) return;
        if (state.subscriptions.some(s => ACTIVE_STATES.has(s.state))) return;
        if (!state.packages.some(p => p.id === packageId)) return;
        const url = new URL(`${API}/checkout/${encodeURIComponent(deps.storeToken)}/${packageId}`);
        url.searchParams.set("extensionId", state.identity.extensionId);
        url.searchParams.set("userId", state.identity.uuid);
        set({ checkoutPending: true });
        deps.openCheckout(url.toString());
      } catch {
        if (current === generation) set({ checkoutPending: false, error: "checkout-failed" });
      } finally { if (current === generation) buying = false; }
    },
  };
}
