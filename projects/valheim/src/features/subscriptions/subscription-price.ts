import type { SubscriptionPackage } from './subscription-controller';

/** Never combine a fallback USD amount with a live price in a different currency. */
export function subscriptionPrice(
  live: SubscriptionPackage | undefined,
  fallback: { price: number; currency: string },
): { price: number; currency: string } {
  return live?.price !== undefined && Number.isFinite(live.price) && live.price >= 0
    && live.currency && /^[A-Z]{3}$/.test(live.currency)
    ? { price: live.price, currency: live.currency }
    : fallback;
}
