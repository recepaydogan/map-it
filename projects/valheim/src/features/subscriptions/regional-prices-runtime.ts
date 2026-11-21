import { useEffect, useSyncExternalStore } from 'react';
import { SUBSCRIPTION_CONFIG } from './subscription-config';
import { createRegionalPriceStore } from './regional-prices';

export const regionalPrices = createRegionalPriceStore(async () => {
  const base = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('pricing-not-configured');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 12_000);
  try {
    const response = await fetch(`${base}/functions/v1/valheim-regional-prices`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store', signal: abort.signal,
    });
    if (!response.ok) throw new Error('pricing-request-failed');
    return await response.json();
  } finally { clearTimeout(timer); }
}, Object.values(SUBSCRIPTION_CONFIG.premiumPackageIds));

export function useRegionalPrices(enabled: boolean) {
  const state = useSyncExternalStore(regionalPrices.subscribe, regionalPrices.getSnapshot, regionalPrices.getSnapshot);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { void regionalPrices.refresh(); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [enabled]);
  return state;
}
