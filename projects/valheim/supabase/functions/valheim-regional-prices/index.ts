import { createRegionalPrices } from './handler.ts';

Deno.serve(createRegionalPrices({
  publicToken: Deno.env.get('TEBEX_PUBLIC_KEY')?.trim() ?? '',
  privateKey: Deno.env.get('TEBEX_PRIVATE_KEY')?.trim() ?? '',
  fetch,
}));
