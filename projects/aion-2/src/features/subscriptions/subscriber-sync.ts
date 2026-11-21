import type { SubscriptionIdentity, SubscriptionRecord } from './subscription-controller';

/** Keep the last successful state only; failed writes retry at the next API check. */
export function createSubscriberLedgerSync(send: (identity: SubscriptionIdentity, token: string) => Promise<void>) {
  let lastKey = '';
  let inFlight: Promise<void> | null = null;
  let pendingKey = '';
  return async (identity: SubscriptionIdentity, token: string, records: SubscriptionRecord[], force = false): Promise<void> => {
    const key = JSON.stringify([identity.extensionId, identity.uuid,
      records.map(record => [record.packageId, record.state, record.recurringPaymentId ?? ""]).sort()]);
    while (inFlight) {
      if (pendingKey === key) {
        await inFlight;
        return;
      }
      await inFlight.catch(() => undefined);
    }
    if (!force && key === lastKey) return;
    // A failed manual refresh must also be retried by the next automatic check.
    lastKey = '';
    pendingKey = key;
    const task = send(identity, token).then(() => { lastKey = key; });
    inFlight = task;
    try { await task; } finally { if (inFlight === task) inFlight = null; }
  };
}
