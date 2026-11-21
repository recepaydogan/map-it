import type { EventSound } from "./event-audio";
import type { EventServerRegion } from "../../game-config.ts";
import { isEventServerRegion } from "./event-server-region.ts";

export interface EventPreferences {
  leadMinutes: number;
  sound: EventSound;
  soundSeconds: number;
  enabled: string[];
  serverRegion: EventServerRegion | null;
}

export function defaultEventPreferences(): EventPreferences {
  return { leadMinutes: 5, sound: "chime", soundSeconds: 10, enabled: [], serverRegion: "eu" };
}

export function parseEventPreferences(raw: string | null): EventPreferences {
  if (!raw) return defaultEventPreferences();
  const value = JSON.parse(raw) as EventPreferences;
  if (!value || ![1, 5, 10, 15].includes(value.leadMinutes)
    || !["chime", "bell", "off"].includes(value.sound) || ![3, 10, 20].includes(value.soundSeconds)
    || !Array.isArray(value.enabled) || !value.enabled.every((id) => typeof id === "string")
    || (value.serverRegion !== undefined && value.serverRegion !== null && !isEventServerRegion(value.serverRegion))) {
    throw new Error("Invalid event preferences");
  }
  // Preserve reminder settings without reusing the old, unverified region fields.
  return { leadMinutes: value.leadMinutes, sound: value.sound,
    soundSeconds: value.soundSeconds, enabled: value.enabled, serverRegion: value.serverRegion ?? "eu" };
}
