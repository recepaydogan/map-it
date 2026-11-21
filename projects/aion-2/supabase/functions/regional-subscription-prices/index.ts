import { SUBSCRIPTION_CONFIG } from '../../../src/game-config.ts';
import { createRegionalPrices } from './handler.ts';

Deno.serve(createRegionalPrices({
  publicToken: Deno.env.get('TEBEX_PUBLIC_KEY')?.trim() ?? '',
  privateKey: Deno.env.get('TEBEX_PRIVATE_KEY')?.trim() ?? '',
  packageIds: Object.values(SUBSCRIPTION_CONFIG.premiumPackageIds),
  fetch,
}));
