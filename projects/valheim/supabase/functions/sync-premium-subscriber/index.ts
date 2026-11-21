import { createSubscriberSync } from './handler.ts';

const storeToken = Deno.env.get('TEBEX_PUBLIC_KEY')?.trim();
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ids = Deno.env.get('TEBEX_PREMIUM_PACKAGE_IDS')?.split(',').map(Number) ?? [];
const singleIds = Deno.env.get('TEBEX_SINGLE_PACKAGE_IDS')?.split(',').filter(value => value.trim()).map(Number) ?? [];
if (!storeToken || !supabaseUrl || !serviceRole || !ids.length ||
  [...ids, ...singleIds].some(id => !Number.isSafeInteger(id) || id <= 0) || singleIds.some(id => !ids.includes(id))) {
  throw new Error('Missing subscriber sync server configuration');
}

Deno.serve(createSubscriberSync({
  storeToken, packageIds: new Set(ids), singlePackageIds: new Set(singleIds), fetch,
  save: async (userId, observedAt, rows) => {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/sync_overwolf_subscriber_snapshot`, {
      method: 'POST',
      headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: userId, p_observed_at: observedAt, p_rows: rows }),
      signal: AbortSignal.timeout(8000),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error('subscriber-write-failed');
  },
}));
