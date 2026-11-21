import { isIP } from 'node:net';

const PACKAGE_IDS = [7813740, 7815465, 7813741];
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

export function createRegionalPrices(deps: { publicToken: string; privateKey: string; fetch: typeof fetch }) {
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  return async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return reply({ error: 'method-not-allowed' }, 405);
    // Hosted Supabase supplies these gateway headers. Never accept a country or IP in the body/query.
    const ip = (request.headers.get('cf-connecting-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0] || '').trim();
    if (!isIP(ip)) return reply({ error: 'client-location-unavailable' }, 503);
    if (!deps.publicToken || !deps.privateKey) return reply({ error: 'pricing-not-configured' }, 503);
    try {
      const url = new URL(`https://headless.tebex.io/api/accounts/${encodeURIComponent(deps.publicToken)}/packages`);
      url.searchParams.set('ipAddress', ip);
      const response = await deps.fetch(url, {
        headers: { Authorization: `Basic ${btoa(`${deps.publicToken}:${deps.privateKey}`)}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error('upstream'); }
      const body = await response.json();
      if (!Array.isArray(body.data)) throw new Error('invalid-prices');
      const data = PACKAGE_IDS.map(id => {
        const item = body.data.find((value: { id?: number }) => value?.id === id);
        if (!item || item.type !== 'subscription' || typeof item.total_price !== 'number'
          || !Number.isFinite(item.total_price) || item.total_price < 0
          || typeof item.currency !== 'string' || !/^[A-Z]{3}$/.test(item.currency)) throw new Error('invalid-prices');
        return { id, price: item.total_price, currency: item.currency };
      });
      // Public quotes only: never return credentials, client IP, subscriptions, or other apps' packages.
      return reply({ data });
    } catch {
      return reply({ error: 'regional-prices-unavailable' }, 502);
    }
  };
}
