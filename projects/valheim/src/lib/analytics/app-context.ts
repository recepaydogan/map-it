/**
 * Analytics context — the "where is this happening" half of every event.
 *
 * PostHog super properties are NOT usable here: posthog.register() writes them
 * into the same localStorage bucket, which the extension's windows SHARE — the
 * in-game overlay would stamp its `surface` onto the desktop window's events.
 * So the context lives in this module's memory instead (one copy per window)
 * and analytics.ts merges it into every capture.
 */

export type AnalyticsSurface =
  | "desktop"
  | "in_game"
  | "web"
  | "background"
  | "uninstall";

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
