const PLACEMENT_STATE_KEY = "peak-map:overlay-default-placement-v1";
const PREFERENCES_STORAGE_KEY = "peak-map:preferences";
const ONBOARDING_STORAGE_KEY = "peak-map:onboarded-v1";
const SCREEN_EDGE_GAP = 24;

type PlacementState = "pending" | "done" | "preserve";

const readPlacementState = (): PlacementState | null => {
  try {
    const value = window.localStorage.getItem(PLACEMENT_STATE_KEY);
    return value === "pending" || value === "done" || value === "preserve" ? value : null;
  } catch {
    return null;
  }
};

const writePlacementState = (state: PlacementState): void => {
  try {
    window.localStorage.setItem(PLACEMENT_STATE_KEY, state);
  } catch {
    // Overwolf will fall back to its own restored window position.
  }
};

/**
 * Freeze the migration decision before onboarding can write its own storage.
 * Existing installations keep the position they chose; clean installations
 * receive the new top-right default on the overlay's first open.
 */
export const initializeOverlayDefaultPlacement = (): void => {
  if (typeof window === "undefined" || readPlacementState() !== null) return;

  try {
    const hasExistingUserData =
      window.localStorage.getItem(PREFERENCES_STORAGE_KEY) !== null
      || window.localStorage.getItem(ONBOARDING_STORAGE_KEY) !== null;
    writePlacementState(hasExistingUserData ? "preserve" : "pending");
  } catch {
    // Leave the state unset so a later window can retry the decision.
  }
};

const getGameWidth = (): Promise<number | null> =>
  new Promise((resolve) => {
    if (typeof overwolf === "undefined" || !overwolf.games?.getRunningGameInfo) {
      resolve(null);
      return;
    }

    overwolf.games.getRunningGameInfo((result) => {
      if (!result?.success || !result.isRunning) {
        resolve(null);
        return;
      }
      const width = Number(result.logicalWidth || result.width);
      resolve(Number.isFinite(width) && width > 0 ? width : null);
    });
  });

let placementPromise: Promise<void> | null = null;

export const placeOverlayAtDefaultIfNeeded = (
  windowInfo: overwolf.windows.WindowResult["window"],
): Promise<void> => {
  initializeOverlayDefaultPlacement();
  if (readPlacementState() !== "pending") return Promise.resolve();
  if (placementPromise) return placementPromise;

  placementPromise = (async () => {
    const gameWidth = await getGameWidth();
    if (gameWidth === null) return;

    const overlayWidth = Number(windowInfo.width) || 360;
    const left = Math.max(SCREEN_EDGE_GAP, Math.round(gameWidth - overlayWidth - SCREEN_EDGE_GAP));

    await new Promise<void>((resolve) => {
      overwolf.windows.changePosition(windowInfo.id, left, SCREEN_EDGE_GAP, (result) => {
        if (result?.success) writePlacementState("done");
        resolve();
      });
    });
  })().finally(() => {
    placementPromise = null;
  });

  return placementPromise;
};

