export interface RegionalPrice { id: number; price: number; currency: string }
export interface RegionalPriceState {
  status: 'loading' | 'ready' | 'error';
  prices: RegionalPrice[];
}

/** Quotes are independent of Overwolf entitlements, and are never persisted across sessions. */
export function createRegionalPriceStore(load: () => Promise<unknown>, packageIds: readonly number[]) {
  let state: RegionalPriceState = { status: 'loading', prices: [] };
  let pending: Promise<void> | undefined;
  let checkedAt = 0;
  const listeners = new Set<() => void>();
  const set = (next: RegionalPriceState) => { state = next; listeners.forEach(listener => listener()); };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh(force = false) {
      if (pending) return pending;
      if (!force && state.status === 'ready' && Date.now() - checkedAt < 60_000) return Promise.resolve();
      set({ status: 'loading', prices: [] });
      pending = Promise.resolve().then(load).then(value => {
        if (!value || typeof value !== 'object' || !('data' in value) || !Array.isArray(value.data)) throw new Error('invalid-prices');
        const rows: unknown[] = value.data;
        const prices = packageIds.map(id => {
          const row = rows.find((item): item is RegionalPrice => Boolean(item && typeof item === 'object' && 'id' in item && item.id === id));
          if (!row || !Number.isFinite(row.price) || row.price < 0 || typeof row.price !== 'number'
            || typeof row.currency !== 'string' || !/^[A-Z]{3}$/.test(row.currency)) throw new Error('invalid-prices');
          return { id, price: row.price, currency: row.currency };
        });
        checkedAt = Date.now();
        set({ status: 'ready', prices });
      }).catch(() => set({ status: 'error', prices: [] })).finally(() => { pending = undefined; });
      return pending;
    },
  };
}
