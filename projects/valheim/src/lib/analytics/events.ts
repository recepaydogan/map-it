/**
 * Event-name constants — one canonical spelling per event, so the same action
 * can never land under two slightly different names in PostHog.
 */
export const EVENTS = {
  /* Craft overlay and desktop companion; see docs/craft-window-analytics.md. */
  CRAFT_WINDOW_OPENED: "craft_window_opened",
  CRAFT_WINDOW_CLOSE_DIALOG_CANCELLED: "craft_window_close_dialog_cancelled",
  CRAFT_WINDOW_CLOSE_CONFIRMED: "craft_window_close_confirmed",
  CRAFT_WINDOW_CLOSE_FAILED: "craft_window_close_failed",
  CRAFT_AUTO_LAUNCH_CHANGED: "craft_auto_launch_changed",
  /* Session */
  APP_OPENED: "app_opened",
  APP_UNINSTALLED: "app_uninstalled",

  /* Game session */
  GAME_STARTED: "game_started",
  GAME_STOPPED: "game_stopped",

  /* Local save discovery */
  /** A Valheim world-save scan completed (props: result — found, empty, or
      error; world_count, local_world_count, steam_cloud_world_count). World
      names, seeds, UIDs, and file paths are intentionally never included. */
  WORLD_SAVES_DISCOVERED: "world_saves_discovered",

  /** A user changed the local-world spoiler mode (props: from, to only). */
  MAP_SPOILER_MODE_CHANGED: "map_spoiler_mode_changed",

  /* In-game overlay */
  IN_GAME_OVERLAY_OPENED: "in_game_overlay_opened",
  IN_GAME_OVERLAY_CLOSED: "in_game_overlay_closed",

  /* Account */
  SIGN_IN_COMPLETED: "sign_in_completed",
  SIGN_OUT: "sign_out",

  /* Support */
  SUPPORT_REPORT_SENT: "support_report_sent",

  /* Position tracker install */
  /** A previously unknown Valheim install directory was found automatically
      (props: method, install_directory, executable_path). */
  TRACKER_DIRECTORY_DETECTED: "tracker_directory_detected",
  /** The last-resort Valheim folder picker was offered and opened. */
  TRACKER_FOLDER_PICKER_OPENED: "tracker_folder_picker_opened",
  /** The picker flow ended (props: result — selected, cancelled, invalid, or
      opted_out for "I don't want live position tracking"). */
  TRACKER_FOLDER_PICKER_COMPLETED: "tracker_folder_picker_completed",
  /** A valid Valheim directory was chosen manually (props: install_directory,
      executable_path). */
  TRACKER_FOLDER_MANUALLY_SELECTED: "tracker_folder_manually_selected",

  /* Live position */
  /** The first fresh player position of a game session arrived (props:
      wait_seconds, after_missing, sample_age_seconds, read_outcome). */
  LIVE_POSITION_CONNECTED: "live_position_connected",
  /** No fresh player position arrived within the grace window (props:
      waited_seconds, reason, last_read_outcome, install_directory_known). */
  LIVE_POSITION_MISSING: "live_position_missing",

} as const;
