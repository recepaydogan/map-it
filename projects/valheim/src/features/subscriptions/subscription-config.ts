/** Valheim packages in RA Studio Apps; other games never grant this entitlement. */
export const SUBSCRIPTION_CONFIG = {
  protocolScheme: 'valheimmap',
  premiumPackageIds: { monthly: 7813740, quarterly: 7815465, annual: 7813741 },
  premiumPackageTiers: { monthly: 1, quarterly: 1, annual: 2 },
  /** Full-price examples for the explicit UI preview only; live modal prices come from Tebex by IP. */
  premiumPrices: {
    monthly: { price: 4.99, currency: 'USD' },
    quarterly: { price: 12.99, currency: 'USD' },
    annual: { price: 39.99, currency: 'USD' },
  },
} as const;

/** Independent, text-only channel; does not switch game-content releases. */
export const SUBSCRIPTION_LOCALE_CONFIG = {"origin": "https://pz.ingredientassets.com", "slug": "valheim", "languages": ["en", "ru", "zh-Hans", "pt-BR"]} as const;
