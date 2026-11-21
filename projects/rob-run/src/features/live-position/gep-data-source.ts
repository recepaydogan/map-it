import { gepObject, mergeGepCharacter } from "../character-sync/gep-character";
import type { CharacterSnapshot } from "../character-sync/character-snapshot";
import { getCharacterSyncState, writeCharacterSyncState } from "../character-sync/character-sync-store";
import { importAddonCharacters } from "../map/map-character-profiles";
import { expandMinimap, hideWindow, OVERLAY_MAP_WINDOW } from "../../overwolf-utils/window-manager";
import { clearLivePosition, publishLivePosition } from "./live-position-store";
import { projectGepPosition } from "./gep-position";
import { setTrackingStatus } from "./tracking-status";
import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import { getLaunchPreferences } from "../settings/launch-preferences";

export function createGepDataSource(diagnostic: (kind: string, data: unknown) => void = () => {}) {
  let active = false, sessionId = "";
  let opened = false, sequence = Date.now();
  let locationReported = false;
  const publishCharacter = (phase: "waiting" | "checking" | "synced" | "error", character?: CharacterSnapshot) => {
    const saved = getCharacterSyncState();
    const characters = character ? { ...saved.characters, [character.id]: character } : saved.characters;
    const currentId = character?.id ?? saved.currentId;
    writeCharacterSyncState({ ...saved, version: 1, characters,
      currentId, phase, checkedAt: Date.now(), liveConnected: active && phase === "synced" });
    importAddonCharacters(Object.values(characters).map(entry => ({ ...entry,
      source: entry.source === "gep" ? "gep" : "addon", syncedAt: entry.updatedAt })), currentId, saved.currentId,
      currentId === saved.savedCurrentId ? saved.savedCurrentId : null);
  };
  return {
    game(running: boolean) {
      const saved = getCharacterSyncState();
      const savedCurrent = saved.savedCurrentId ? saved.characters[saved.savedCurrentId] : undefined;
      active = running; opened = false;
      locationReported = false;
      sessionId = `gep:${Date.now()}`;
      clearLivePosition();
      if (!running) void hideWindow(OVERLAY_MAP_WINDOW).catch(() => {});
      setTrackingStatus(running ? "connecting" : "waiting-game");
      publishCharacter(running ? "checking" : "waiting", running ? savedCurrent : undefined);
    },
    registration(success: boolean) {
      if (!active) return;
      if (!success) { setTrackingStatus("error"); publishCharacter("error"); }
      else publishCharacter("waiting");
    },
    info(raw: unknown) {
      if (!active) return;
      const info = gepObject(raw);
      if (!info.player_info) return;
      const player = gepObject(info.player_info);
      const name = typeof player.character_name === "string" ? player.character_name.trim() : "";
      const saved = getCharacterSyncState();
      // SavedVariables can switch the current character between GEP updates.
      const current = saved.currentId ? saved.characters[saved.currentId] ?? null : null;
      let base = current;
      if (name && base?.name !== name) {
        const matches = Object.values(saved.characters).filter(entry => entry.name === name);
        base = matches.length === 1 ? matches[0]! : null;
      }
      const next = mergeGepCharacter(base, player, name ? `${sessionId}:${encodeURIComponent(name)}` : sessionId, Date.now());
      if (!next || next === current) return;
      // A changed character must not retain the previous character's position.
      if (current?.name && next.name !== current.name) {
        clearLivePosition(); opened = false;
        setTrackingStatus("connecting");
      }
      publishCharacter("synced", next);
    },
    events(raw: unknown) {
      if (!active || !Array.isArray(raw)) return;
      for (const entry of raw) {
        const event = gepObject(entry);
        if (event.name !== "location") continue;
        const point = projectGepPosition(event.data);
        if (!point) {
          diagnostic("location-rejected", { reason: "invalid-coordinates-or-unmapped-ui-map", payload: event.data });
          clearLivePosition();
          setTrackingStatus("unavailable-map");
          opened = false;
          continue;
        }
        const now = Date.now();
        const autoOpen = !opened && getLaunchPreferences().autoOpenMinimap;
        diagnostic("location-projected", { input: event.data, point, opensMinimap: autoOpen });
        publishLivePosition({ version: 1, ...point, sequence: ++sequence, dx: 0, dy: 0, updatedAt: now, receivedAt: now });
        setTrackingStatus("live");
        if (!locationReported) {
          locationReported = true;
          track(EVENTS.LOCATION_RECEIVED_BY_GEP, { source: "gep" });
        }
        if (autoOpen) { opened = true; void expandMinimap(); }
      }
    },
    error() {
      if (!active) return;
      clearLivePosition(); opened = false;
      setTrackingStatus("error"); publishCharacter("error");
    },
  };
}
