import { ASSET_CDN_BASE_URL } from './asset-cdn-config.ts'

/** Game icons and location artwork load from the verified, immutable CDN release. */
export const assetUrl = (path: string): string => `${ASSET_CDN_BASE_URL}/${path.replace(/^\//, '')}`
