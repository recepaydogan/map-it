/**
 * Event-name constants — one canonical spelling per event, so the same action
 * can never land under two slightly different names in PostHog.
 *
 * Every event also carries this window's context (surface, screen setup,
 * game_running — see app-context), so the names below stay about WHAT happened;
 * where and under what conditions is answered by the properties.
 */
export const EVENTS = {
  /* Account */
  SIGN_IN_COMPLETED: "sign_in_completed",
  SIGN_OUT: "sign_out",
  APP_UNINSTALLED: "app_uninstalled",
  SUPPORT_REPORT_SENT: "support_report_sent",

  /* Session */
  /** A UI window booted (one per desktop launch, one per overlay window
      creation). The minimap overlay is hidden/shown rather than closed, so its
      per-show visibility is the OVERLAY_* pair below, not this. */
  APP_OPENED: "app_opened",

  /* Game session */
  /** The game started / stopped (stopped carries session_minutes). Sent by the
      BACKGROUND window — the only one alive for a whole app session, so a game
      started from the tray or by the manifest's GameLaunch auto-start is still
      counted (see background-analytics). */
  GAME_STARTED: "game_started",
  GAME_STOPPED: "game_stopped",
  /** The Overwolf ids returned for an observed game process. */
  GAME_DETECTION_OBSERVED: "game_detection_observed",

  /* In-game minimap overlay */
  /** The overlay became visible over the game. Sent by the BACKGROUND window —
      the overlay is hidden/shown from the outside (hotkey, game start/stop), so
      only the background sees every transition (see background-analytics). */
  OVERLAY_OPENED: "overlay_opened",
  /** The overlay was hidden or closed, by any path (props: open_seconds). */
  OVERLAY_CLOSED: "overlay_closed",

  /* In-game full app window */
  /** The full app appeared over the game (props: source — "auto" for the
      single-monitor auto-open, "manual" for the hotkey). */
  IN_GAME_APP_OPENED: "in_game_app_opened",
  /** The full-app window was hidden or closed (props: open_seconds). */
  IN_GAME_APP_CLOSED: "in_game_app_closed",

  /* Map interaction */
  /** One event per FIVE locations opened, describing the batch (see map-events). */
  MARKERS_OPENED: "markers_opened",
  MAP_SEARCHED: "map_searched",
  /** The player picked another registered map (props: map). */
  MAP_SWITCHED: "map_switched",
  /** A personal marker was placed (props: source — "placement" or "coordinate"). */
  CUSTOM_MARKER_CREATED: "custom_marker_created",

  /* Settings */
  /** A preference was changed (props: setting, value) — one event for every
      toggle and picker, so a new preference doesn't need a new event name. */
  SETTING_CHANGED: "setting_changed",
  /** A global hotkey was rebound in Settings (props: hotkey, success). */
  HOTKEY_REBOUND: "hotkey_rebound",
} as const;
