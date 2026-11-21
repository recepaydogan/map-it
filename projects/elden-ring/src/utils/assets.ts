/**
 * The big extracted image sets — the Elden Ring item icons (~78MB, 2.6k files),
 * the ER + Nightreign boss portraits and the TEST MAP enemy portraits — are served
 * from a CDN. Everything else (world-map symbols in /icons/elden-ring/map,
 * /poi-icons, the map tile pyramids and the local fallback icons) ships inside the
 * OPK so the app is usable offline.
 *
 * `VITE_ASSET_BASE` is empty in dev and the local `npm run build` (icons load from
 * /public), and set to the jsDelivr base (e.g.
 * "https://cdn.jsdelivr.net/gh/<user>/<repo>@v1") for a CDN release build. A
 * trailing slash is tolerated. When it's empty `itemIconUrl` returns the same
 * "/icons/..." path the app has always used, so nothing breaks without a CDN.
 */
const ASSET_BASE = (import.meta.env.VITE_ASSET_BASE ?? "").replace(/\/+$/, "");

/** CDN (or local, when ASSET_BASE is empty) URL for an extracted item icon. */
export const itemIconUrl = (iconId: number): string =>
  `${ASSET_BASE}/icons/elden-ring/items/${iconId}.png`;

/** CDN (or local) URL for a boss/miniboss portrait (720×405 webp, ~5MB set). */
export const bossPortraitUrl = (file: string): string =>
  `${ASSET_BASE}/icons/elden-ring/bosses/${file}`;

/** CDN (or local) URL for a Nightreign boss portrait (720×405 webp, ~2MB set). */
export const nrBossPortraitUrl = (file: string): string =>
  `${ASSET_BASE}/icons/nightreign/bosses/${file}`;

/** CDN (or local) URL for a TEST MAP regular-enemy portrait (720×405 webp, ~12MB set). */
export const enemyPortraitUrl = (file: string): string =>
  `${ASSET_BASE}/icons/elden-ring/enemies/${file}`;

/** CDN (or local) URL for a Nightreign archive item icon (~21MB, 1.3k files). Streamed
 * from the CDN so the OPK stays lean; the archive shows a per-category fallback glyph
 * when this can't load (offline, or the id has no icon). Nightfarer/Nightlord, relic
 * and world-map icons deliberately stay bundled — those must render offline. */
export const nrItemIconUrl = (id: number): string =>
  `${ASSET_BASE}/icons/nightreign/items/${id}.png`;
