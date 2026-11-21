import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { nextOccurrence, type ScheduledEvent } from "./event-schedule";
import { eventServerTimeZone } from "./event-server-region";
import { useEventPreferences } from "./use-event-preferences";

/** Convert the selected server's next recurrence to the device's display clock. */
export default function SchedulePreview({ days, minutes }: { days: number[]; minutes: number[] }) {
  const { t, i18n } = useTranslation();
  const { preferences } = useEventPreferences();
  const timeZone = eventServerTimeZone(preferences.serverRegion);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const event: ScheduledEvent = {
    id: "schedule-preview", name: "", kind: "activity", days, minutes,
    durationSeconds: 0, entryWindowSeconds: 0,
  };
  const next = timeZone && days.length && minutes.length
    ? nextOccurrence(event, now, timeZone) : null;
  const nextTime = next && new Date(next.nextStart).toLocaleString(i18n.language, {
    weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  if (!timeZone) return <p className="text-xs text-subtle">{t("events.chooseServerInEvents")}</p>;
  return nextTime ? <p className="text-xs text-subtle">{t("reference.schedule.nextLocal", { time: nextTime })}</p> : null;
}
