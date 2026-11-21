import {
  closeWindow,
  parkWindowBesideAnchor,
  restoreWindowPreservingPlacement,
  surfaceWindowOverExternalApp,
} from "../../overwolf-utils/window-manager";
import { IS_OVERWOLF } from "../../utils/platform";

/** The dashboard the companion parks beside (manifest window name). */
const DASHBOARD_WINDOW_NAME = "main";

export const COMPANION_WINDOW_NAME = "companion";
export const COMPANION_SIZE = { width: 440, height: 739 } as const;

/**
 * Open (or re-open) the Roundtable companion and lift it to the foreground.
 *
 * Two callers: the dashboard's title-bar launcher, and the background brain
 * (hotkey + game launch). Closing is always left to the user — the companion is
 * meant to stay up for a whole boss-attempt loop.
 *
 * Outside Overwolf (`npm run dev`) it previews in a popup, since App.tsx honours
 * the ?window= query param.
 */
export const openCompanion = async (): Promise<void> => {
  if (!IS_OVERWOLF) {
    window.open(
      `${window.location.pathname}?window=${COMPANION_WINDOW_NAME}`,
      COMPANION_WINDOW_NAME,
      `width=${COMPANION_SIZE.width},height=${COMPANION_SIZE.height}`,
    );
    return;
  }
  await restoreWindowPreservingPlacement(COMPANION_WINDOW_NAME).catch((err) =>
    console.warn("[Companion] open failed", err),
  );
  await parkWindowBesideAnchor(COMPANION_WINDOW_NAME, DASHBOARD_WINDOW_NAME).catch((err) =>
    console.warn("[Companion] positioning failed", err),
  );
  await surfaceWindowOverExternalApp(COMPANION_WINDOW_NAME).catch((err) =>
    console.warn("[Companion] surface failed", err),
  );
};

/** Close the companion (no-op when it isn't open). */
export const closeCompanion = async (): Promise<void> => {
  if (!IS_OVERWOLF) return;
  await closeWindow(COMPANION_WINDOW_NAME).catch((err) =>
    console.warn("[Companion] close failed", err),
  );
};
