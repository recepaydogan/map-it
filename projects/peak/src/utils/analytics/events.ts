/**
 * Event-name constants — one canonical spelling per event.
 */
export const EVENTS = {
  /* Account */
  SIGN_IN_COMPLETED: "sign_in_completed",
  SIGN_OUT: "sign_out",
  APP_UNINSTALLED: "app_uninstalled",

  /* In-game overlay */
  IN_GAME_OVERLAY_OPENED: "in_game_overlay_opened",
  IN_GAME_OVERLAY_CLOSED: "in_game_overlay_closed",

  /* Preferences */
  LANGUAGE_CHANGED: "language_changed",
  
  /* Support */
  SUPPORT_REPORT_SENT: "support_report_sent",

  /* Position tracker install */
  /** A previously unknown PEAK install directory was found automatically
      (props: method — running_game, default_install, or steam_library;
      install_directory, executable_path). */
  TRACKER_DIRECTORY_DETECTED: "tracker_directory_detected",
  /** The last-resort PEAK folder picker was offered and opened. */
  TRACKER_FOLDER_PICKER_OPENED: "tracker_folder_picker_opened",
  /** The picker flow ended (props: result — selected, cancelled, invalid, or
      opted_out for "I don't want live position tracking"). */
  TRACKER_FOLDER_PICKER_COMPLETED: "tracker_folder_picker_completed",
  /** A valid PEAK directory was chosen manually (props: install_directory,
      executable_path). */
  TRACKER_FOLDER_MANUALLY_SELECTED: "tracker_folder_manually_selected",

  /* Live position */
  /** The first usable local-player position of a game session arrived (props:
      wait_seconds, after_missing, payload_version, disabled_features). */
  LIVE_POSITION_CONNECTED: "live_position_connected",
  /** No usable local-player position arrived within the grace window (props:
      waited_seconds, reason, tracking_status, last_sample_seen,
      disabled_features). */
  LIVE_POSITION_MISSING: "live_position_missing",
} as const;
