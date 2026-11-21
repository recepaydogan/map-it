import { useEffect, useRef, useState } from "react";
import { playEventAudio, stopEventAudio, type EventSound } from "./event-audio";
import { nextOccurrence, reminderKey, type ScheduledEvent } from "./event-schedule";

export function useEventReminders(events: ScheduledEvent[], options: {
  owner: boolean; timeZone: string | null; enabled: string[]; leadMinutes: number; sound: EventSound; soundSeconds: number;
}) {
  const [now, setNow] = useState(Date.now);
  const [notice, setNotice] = useState<{ events: Pick<ScheduledEvent, "id" | "name">[]; start: number; timeZone: string } | null>(null);
  const [audioError, setAudioError] = useState(false);
  const sent = useRef(new Map<string, string>());
  const { owner, timeZone, enabled, leadMinutes, sound, soundSeconds } = options;
  useEffect(() => () => stopEventAudio(), [timeZone]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      setNotice((current) => current && time > current.start + 60_000 ? null : current);
      if (!owner || !timeZone) return;
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
      setNotice({ events: due.map((item) => ({ id: item.event.id, name: item.event.name })), start: due[0]!.nextStart, timeZone });
      void playEventAudio(sound, soundSeconds).catch((error: unknown) => {
        console.error("Failed to play event reminder", error);
        setAudioError(true);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [events, owner, timeZone, enabled, leadMinutes, sound, soundSeconds]);
  return { now, notice: notice?.timeZone === timeZone ? notice : null,
    dismiss: () => { setNotice(null); stopEventAudio(); }, audioError, setAudioError };
}
