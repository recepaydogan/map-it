import { useEffect, useRef, useState } from "react";
import { playEventAudio, stopEventAudio, type EventSound } from "./event-audio";
import { nextOccurrence, reminderKey, type ScheduledEvent } from "./event-schedule";

export function useEventReminders(events: ScheduledEvent[], options: {
  owner: boolean; timeZone: string; enabled: string[]; leadMinutes: number; sound: EventSound; soundSeconds: number;
}) {
  const [now, setNow] = useState(Date.now);
  const [notice, setNotice] = useState<{ names: string[]; start: number } | null>(null);
  const [audioError, setAudioError] = useState(false);
  const sent = useRef(new Map<string, string>());
  const { owner, timeZone, enabled, leadMinutes, sound, soundSeconds } = options;
  useEffect(() => {
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      setNotice((current) => current && time > current.start + 60_000 ? null : current);
      if (!owner) return;
      const due = events.flatMap((event) => {
        if (!enabled.includes(event.id)) return [];
        const occurrence = nextOccurrence(event, time, timeZone);
        if (!occurrence || occurrence.nextStart - time > leadMinutes * 60_000) return [];
        const key = reminderKey(occurrence, timeZone);
        if (sent.current.get(event.id) === key) return [];
        sent.current.set(event.id, key);
        return [occurrence];
      });
      if (!due.length) return;
      setNotice({ names: due.map((item) => item.event.name), start: due[0]!.nextStart });
      void playEventAudio(sound, soundSeconds).catch((error: unknown) => {
        console.error("Failed to play event reminder", error);
        setAudioError(true);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [events, owner, timeZone, enabled, leadMinutes, sound, soundSeconds]);
  useEffect(() => () => stopEventAudio(), []);
  return { now, notice, dismiss: () => { setNotice(null); stopEventAudio(); }, audioError, setAudioError };
}
