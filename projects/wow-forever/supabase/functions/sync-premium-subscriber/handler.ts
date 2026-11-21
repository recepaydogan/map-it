export interface SubscriberRow {
  package_id: number;
  billing_type: 'recurring' | 'one_time';
  status: string;
  overwolf_state: string;
  recurring_payment_id: string | null;
}
interface Dependencies {
  storeToken: string;
  packageIds: ReadonlySet<number>;
  singlePackageIds: ReadonlySet<number>;
  fetch: typeof fetch;
  save: (userId: string, observedAt: string, rows: SubscriberRow[]) => Promise<void>;
}
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const states: Record<string, string> = {
  ACTIVE: 'active', PENDING_CANCELLATION: 'pending_cancellation', PENDING_DOWNGRADE: 'pending_downgrade',
  EXPIRED: 'expired', CANCELLED: 'cancelled', OVERDUE: 'overdue', ENDED: 'ended',
  REFUNDED: 'refunded', DISPUTED: 'disputed', CHARGEBACK: 'chargeback',
};
const reply = (status: number) => new Response(null, { status, headers: cors });

export function createSubscriberSync(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return reply(204);
    if (request.method !== 'POST') return reply(405);
    const authorization = request.headers.get('authorization') ?? '';
    if (!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization) || authorization.length > 8192) return reply(401);
    let extensionId: string;
    let userId: string;
    try {
      const body = await request.text();
      if (body.length > 1024) return reply(413);
      const data = JSON.parse(body);
      if (typeof data?.extensionId !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(data.extensionId)) return reply(400);
      extensionId = data.extensionId;
      const token = authorization.slice(7);
      if (token.split('.').length !== 3) return reply(401);
      const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
      if (typeof claims.sub !== 'string' || !uuid.test(claims.sub) ||
        typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) return reply(401);
      // Decode only to locate the subject; no claim is trusted before remote verification.
      userId = claims.sub.toLowerCase();
    } catch { return reply(400); }
    try {
      const options = { headers: { Authorization: authorization }, signal: AbortSignal.timeout(10_000), redirect: 'error' as const };
      const verification = await deps.fetch(`https://accounts.overwolf.com/tokens/short-lived/verify?extensionId=${encodeURIComponent(extensionId)}`, options);
      await verification.body?.cancel();
      if (verification.status === 401 || verification.status === 403) return reply(401);
      if (verification.status !== 200) return reply(502);
      const observedAt = new Date().toISOString();
      const result = await deps.fetch(`https://subscriptions-api.overwolf.com/subscriptions/${encodeURIComponent(deps.storeToken)}?extensionId=${encodeURIComponent(extensionId)}`,
        { ...options, signal: AbortSignal.timeout(10_000) });
      if (!result.ok) { await result.body?.cancel(); return reply(result.status === 401 ? 401 : 502); }
      const records = await result.json();
      if (!Array.isArray(records) || records.length > 1000) return reply(502);
      const rows = new Map<number, SubscriberRow>();
      for (const item of records) {
        if (!item || typeof item.userId !== 'string' || item.userId.toLowerCase() !== userId ||
          !Number.isSafeInteger(item.packageId) || typeof item.state !== 'string' || item.state.length > 80) return reply(502);
        if (!deps.packageIds.has(item.packageId)) continue;
        const row: SubscriberRow = {
          package_id: item.packageId, billing_type: deps.singlePackageIds.has(item.packageId) ? 'one_time' : 'recurring',
          status: Object.hasOwn(states, item.state) ? states[item.state] : 'unknown', overwolf_state: item.state,
          recurring_payment_id: typeof item.recurringPaymentId === 'string' ? item.recurringPaymentId.slice(0, 200) : null,
        };
        // Some accounts can have an old ended agreement and a new active one.
        const priority = (state: string) => state === 'active' ? 3 : state === 'pending_cancellation' ? 2 : 1;
        const previous = rows.get(row.package_id);
        if (!previous || priority(row.status) > priority(previous.status)) rows.set(row.package_id, row);
      }
      await deps.save(userId, observedAt, [...rows.values()]);
      return reply(204);
    } catch { return reply(503); }
  };
}
