import { APP_CONFIG } from "../config/app-config";

/**
 * PEAK targets one dedicated game, so Overwolf stores its bindings in the
 * game's hotkey bucket instead of the global bucket used by multi-game apps.
 */
export const HOTKEY_GAME_ID = APP_CONFIG.supportedGameId ?? undefined;

export const getAppHotkeys = (
  result: overwolf.settings.hotkeys.GetAssignedHotkeyResult,
): overwolf.settings.hotkeys.IHotkey[] => {
  if (HOTKEY_GAME_ID === undefined) return result.globals ?? [];
  return result.games?.[String(HOTKEY_GAME_ID)] ?? [];
};
