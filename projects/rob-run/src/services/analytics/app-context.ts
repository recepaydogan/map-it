/**
 * Analytics context — the "where is this happening" half of every event.
 *
 * PostHog super properties are NOT usable here: posthog.register() writes them
 * into the same localStorage bucket, which the extension's windows SHARE — the
 * in-game overlay would stamp its `surface` onto the desktop window's events.
 * So the context lives in this module's memory instead (one copy per window)
 * and analytics.ts merges it into every capture.
 *
 * Two things feed it:
 *  - the display setup (monitor count + primary resolution), read once at boot
 *    from Overwolf — this is what tells us whether a player can actually use the
 *    second-screen desktop app or only the in-game minimap overlay;
 *  - live game state (is the game running right now), pushed in by
 *    use-analytics as the game starts and stops.
 */

/** Which window an event came from. `overlay` is the in-game minimap window.
 *  `background` is the invisible brain window that reports live-position
 *  availability without tracking window or session lifecycles. */
export type AnalyticsSurface = "desktop" | "in_game" | "overlay" | "web" | "background";

/** Subset of overwolf.utils.getMonitorsList's display shape that we read. */
interface DisplayInfo {
  width?: number;
  height?: number;
  is_primary?: boolean;
}

const resolution = (width?: number, height?: number): string | null =>
  width && height ? `${Math.round(width)}x${Math.round(height)}` : null;

const listDisplays = (): Promise<DisplayInfo[]> =>
  new Promise((resolve) => {
    if (typeof overwolf === "undefined" || !overwolf.utils?.getMonitorsList) {
      resolve([]);
      return;
    }
    try {
      overwolf.utils.getMonitorsList((result) => {
        resolve(result?.success ? ((result.displays ?? []) as DisplayInfo[]) : []);
      });
    } catch {
      resolve([]);
    }
  });

/**
 * The player's display setup — kept to the three values a decision could hinge
 * on: how many screens there are, whether the desktop app can live on a second
 * one, and what the main screen's resolution is.
 *
 * Overwolf reports every physical monitor; on the web build (and if the API ever
 * fails) we fall back to `window.screen`, which only ever knows about the one
 * screen the browser is on — hence screen_count 1.
 */
export const readScreenContext = async (): Promise<Record<string, unknown>> => {
  const displays = await listDisplays();

  if (displays.length === 0) {
    return {
      screen_count: window.screen ? 1 : 0,
      multi_monitor: false,
      primary_screen: resolution(window.screen?.width, window.screen?.height),
    };
  }

  const primary = displays.find((d) => d.is_primary) ?? displays[0];
  return {
    screen_count: displays.length,
    multi_monitor: displays.length > 1,
    primary_screen: resolution(primary?.width, primary?.height),
  };
};

/** App version straight from the Overwolf manifest (null on the web build). */
export const readAppVersion = (): Promise<string | null> =>
  new Promise((resolve) => {
    if (typeof overwolf === "undefined" || !overwolf.extensions?.current?.getManifest) {
      resolve(null);
      return;
    }
    try {
      overwolf.extensions.current.getManifest((manifest) => {
        resolve(manifest?.meta?.version ?? null);
      });
    } catch {
      resolve(null);
    }
  });
