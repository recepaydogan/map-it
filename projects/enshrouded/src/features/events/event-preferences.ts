import type { EventSound } from "./event-audio";

export interface EventPreferences {
  leadMinutes: number;
  sound: EventSound;
  soundSeconds: number;
  enabled: string[];
}

export function defaultEventPreferences(): EventPreferences {
  return { leadMinutes: 5, sound: "chime", soundSeconds: 10, enabled: [] };
}

export function parseEventPreferences(raw: string | null): EventPreferences {
  if (!raw) return defaultEventPreferences();
  const value = JSON.parse(raw) as EventPreferences;
  if (!value || ![1, 5, 10, 15].includes(value.leadMinutes)
    || !["chime", "bell", "off"].includes(value.sound) || ![3, 10, 20].includes(value.soundSeconds)
    || !Array.isArray(value.enabled) || !value.enabled.every((id) => typeof id === "string")) {
    throw new Error("Invalid event preferences");
  }
  // Preserve reminder settings from records that also contain legacy region fields.
  return { leadMinutes: value.leadMinutes, sound: value.sound,
    soundSeconds: value.soundSeconds, enabled: value.enabled };
}
