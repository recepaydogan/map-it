/**
 * Event-name constants — one canonical spelling per event, so the same action
 * can never land under two slightly different names in PostHog.
 *
 * Events normally also carry this window's context (surface, screen setup,
 * game_running — see app-context), so the names below stay about WHAT happened;
 * where and under what conditions is answered by the properties. Language
 * switches are the exception: their custom properties are limited to from/to.
 */
export const EVENTS = {
  /* Account */
  SIGN_IN_COMPLETED: "sign_in_completed",
  SIGN_OUT: "sign_out",
  APP_UNINSTALLED: "app_uninstalled",
  SUPPORT_REPORT_SENT: "support_report_sent",

  /* Subscriptions */
  SEE_PACKAGES_CLICKED: "see_packages_clicked",

  /* Game session */
  /** First valid position published to the map, once per game process session. */
  LIVE_POSITION_RECEIVED: "live_position_received",
  /** First usable GEP position, once per game process session. */
  LOCATION_RECEIVED_BY_GEP: "location received by gep",

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
  /** Explicit language selection only (props: from, to). */
  LANGUAGE_CHANGED: "language_changed",
  /** A global hotkey was rebound in Settings (props: hotkey, success). */
  HOTKEY_REBOUND: "hotkey_rebound",
} as const;
