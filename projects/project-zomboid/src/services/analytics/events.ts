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
  /** A UI window booted (one per desktop launch, one per overlay window
      creation). The minimap overlay is hidden/shown rather than closed, so its
      per-show visibility is the OVERLAY_* pair below, not this. */
  APP_OPENED: "app_opened",
  /** The Overwolf background runtime is alive. Emitted at startup and hourly
      while it remains running, including days with no visible UI window.
      Count unique users of this event for installed-app daily active users. */
  APP_ACTIVE: "app_active",

  /* Game session */
  /** Project Zomboid started / stopped (stopped carries session_minutes). Sent
      by the BACKGROUND window — it is the only one alive for a whole app
      session, so a game started from the tray or by the manifest's GameLaunch
      auto-start is still counted (see background-analytics). */
  GAME_STARTED: "game_started",
  GAME_STOPPED: "game_stopped",

  /* In-game minimap overlay */
  /** The overlay became visible over the game. Sent by the BACKGROUND window —
      the overlay is hidden/shown from the outside (hotkey, game start/stop), so
      only the background sees every transition (see background-analytics). */
  OVERLAY_OPENED: "overlay_opened",
  /** The overlay was hidden or closed, by any path — hotkey, game stop, app
      shutdown (props: open_seconds). Same reporter as OVERLAY_OPENED. */
  OVERLAY_CLOSED: "overlay_closed",

  /* In-game full app window */
  /** The full app appeared over the game (props: source — "auto" for the
      single-monitor auto-open, "manual" for the hotkey). Same reporter and same
      reason as the OVERLAY_* pair: only the background sees every transition. */
  IN_GAME_APP_OPENED: "in_game_app_opened",
  /** The full-app window was hidden or closed (props: open_seconds). */
  IN_GAME_APP_CLOSED: "in_game_app_closed",

  /* Live game bridge (the bundled Lua mod that writes the player's position) */
  /** The bundled Bridge mod was written into the Zomboid mods folder, and the
      state changed since the last launch (props: bridge_active — whether the
      player has actually enabled it in their mod list; trigger — "launch" or
      "game_session"; attempt — which of the session passes, 1-3). Not sent when
      nothing changed, so this is a state-transition event, not one per app
      launch. A "game_session" trigger means the launch pass came too early:
      the Zomboid folder only exists once the game has run at least once. */
  BRIDGE_MOD_INSTALLED: "bridge_mod_installed",
  /** The Bridge mod could not be written (props: reason, trigger, attempt).
      Reported once per distinct failure, not once per pass. */
  BRIDGE_MOD_INSTALL_FAILED: "bridge_mod_install_failed",
  /** The first live player position of a game session arrived (props:
      wait_seconds — how long after the game started). This is the event that
      says the whole live chain actually works on this machine. */
  LIVE_POSITION_CONNECTED: "live_position_connected",
  /** The game ran but no position ever arrived within the grace window (props:
      waited_seconds, bridge_active) — usually the mod is installed but not
      enabled in-game. The counterpart of LIVE_POSITION_CONNECTED. */
  LIVE_POSITION_MISSING: "live_position_missing",

  /* Active map-mod discovery */
  /** The app attempted to read the current mod state. Sent at startup and when
      the result changes (props: success, source, trigger, active_mod_count,
      map_folder_count, folder_found, mod_state_file_found,
      root_is_user_selected). No filesystem paths are captured. */
  MAP_MOD_DETECTION_RESULT: "map_mod_detection_result",
  /** The last-resort Zomboid folder picker was shown. */
  ZOMBOID_FOLDER_PICKER_OPENED: "zomboid_folder_picker_opened",
  /** The picker closed (props: result - selected, cancelled, invalid or
      unavailable; resolution for a valid selection). */
  ZOMBOID_FOLDER_PICKER_COMPLETED: "zomboid_folder_picker_completed",

  /* Map interaction */
  /** One event per FIVE locations opened, describing the batch (see map-events). */
  MARKERS_OPENED: "markers_opened",
  MAP_SEARCHED: "map_searched",
  /** The rendered world changed (props: source — "detected" when the player's
      mod list drove it, "manual" for a mod toggle, "map_removed" for a fallback
      after an uninstall). */
  MAP_SWITCHED: "map_switched",
  CUSTOM_MARKER_CREATED: "custom_marker_created",

  /* Loot run planner */
  /** A route was built from the current loot-run targets (props: target_count,
      item). The item is game data (e.g. "Axe"), not personal content. */
  LOOT_RUN_PLANNED: "loot_run_planned",

  /* Prepared map mods — the worlds the app ships tiles for */
  /** Which world the player's Project Zomboid is actually set up to run (props:
      mod_count, mods, world_kind, from_live_session). Sent once at boot and
      again whenever the detected mod list changes, so "which map mods are in
      use" is answerable without asking anyone. */
  MAP_WORLD_DETECTED: "map_world_detected",
  /** A prepared map mod was switched on/off by hand in the library (props:
      mod_key, active) — i.e. our detection didn't match what the player wanted. */
  PREPARED_MAP_MOD_TOGGLED: "prepared_map_mod_toggled",
  /** A map mod was requested from the library panel (props: result,
      request_length, signed_in). The request TEXT is user content and stays out
      of analytics — it already lands in Supabase. */
  MAP_MOD_REQUESTED: "map_mod_requested",

  /* Help & Feedback */
  SUPPORT_REPORT_SENT: "support_report_sent",

  /* Community map library */
  COMMUNITY_MAP_INSTALLED: "community_map_installed",
  COMMUNITY_MAP_REMOVED: "community_map_removed",

  /* Settings */
  /** A preference was changed (props: setting, value) — one event for every
      toggle and picker, so a new preference doesn't need a new event name. */
  SETTING_CHANGED: "setting_changed",
  /** A global hotkey was rebound in Settings (props: hotkey, success). */
  HOTKEY_REBOUND: "hotkey_rebound",
} as const;
