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

  /* Session */
  /** A UI window booted (one per desktop launch, one per in-game overlay open).
      NOT sent by the companion window — that one has its own open/close pair. */
  APP_OPENED: "app_opened",

  /* Game session */
  GAME_STARTED: "game_started",
  GAME_STOPPED: "game_stopped",

  /* In-game overlay (the expanded map over the running game) */
  IN_GAME_OVERLAY_OPENED: "in_game_overlay_opened",
  IN_GAME_OVERLAY_CLOSED: "in_game_overlay_closed",

  /* Roundtable companion (the narrow window that stays up during play) */
  /** The companion window opened. Its own event rather than an app_opened
      filtered by surface, so opens are countable on the name alone. Sent by the
      window itself, on mount. */
  COMPANION_OPENED: "companion_opened",
  /** The companion window closed, by any path — title-bar X, the toggle hotkey,
      app shutdown (props: open_seconds). Sent by the BACKGROUND window, which is
      the only one that can see this window die (see background-analytics). */
  COMPANION_CLOSED: "companion_closed",

  /* Map interaction */
  /** One event per FIVE markers opened, describing the batch (see map-events). */
  MARKERS_OPENED: "markers_opened",
  MAP_SEARCHED: "map_searched",
  MAP_VIEW_CHANGED: "map_view_changed",
  GAME_SWITCHED: "game_switched",
  CUSTOM_MARKER_CREATED: "custom_marker_created",

  /* Community tips on markers */
  /* These carry NO marker id or key — same privacy stance as marker opens (see
     map-events): what players write about is their business, and the shape of
     the feature is answered by categorical properties. */
  /** A tip was posted on a marker. */
  MARKER_COMMENT_POSTED: "marker_comment_posted",
  /** A tip was voted up or down (props: direction). */
  MARKER_COMMENT_VOTED: "marker_comment_voted",
  /** A tip was flagged for moderation. */
  MARKER_COMMENT_REPORTED: "marker_comment_reported",

  /* Help & Feedback */
  /** A report was filed from the in-app support form. */
  SUPPORT_REPORT_SENT: "support_report_sent",

  /* Website → desktop app */
  /* Web-only pair, and a funnel: every _clicked has an _opened before it, so the
     ratio between them is how well the pitch reads. Both carry `source` (the
     title-bar pill or the phone menu card). */
  /** The "get the app" pitch was opened on the website. */
  GET_APP_OPENED: "get_app_opened",
  /** Its download button was followed to the Overwolf store page. */
  GET_APP_CLICKED: "get_app_clicked",

  /* Preferences */
  LANGUAGE_CHANGED: "language_changed",
} as const;
