/**
 * Outbound links the app chrome offers. Kept out of the components that render
 * them so the desktop title bar and the phone navigation drawer can never drift
 * onto two different invites.
 *
 * Open them through `openExternalUrl` (utils/platform) — in Overwolf a plain
 * `window.open` would load the page inside the native window.
 */

/** Community Discord. Leave it "" to turn every Discord affordance into a no-op. */
export const DISCORD_INVITE_URL = "https://discord.gg/dgUS9PW9qm";

/**
 * The app's own page on the Overwolf app store — where the website sends
 * visitors who want the desktop build (features/get-app).
 *
 * Only the WEB build ever links here; inside Overwolf the app is already
 * installed, so every affordance pointing at this URL is gated on `IS_WEB`.
 * Same "" convention as the Discord invite: emptying it removes the CTA.
 */
export const OVERWOLF_STORE_URL = "https://www.overwolf.com/app/elden_ring_atlas-elden_ring_atlas";
