import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { nextOccurrence, type ScheduledEvent } from "./event-schedule";

/** Show the next recurrence using the device's own calendar and clock. */
export default function SchedulePreview({ days, minutes }: { days: number[]; minutes: number[] }) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const event: ScheduledEvent = {
    id: "schedule-preview", name: "", kind: "activity", days, minutes,
    durationSeconds: 0, entryWindowSeconds: 0,
  };
  const next = days.length && minutes.length
    ? nextOccurrence(event, now, Intl.DateTimeFormat().resolvedOptions().timeZone) : null;
  const nextTime = next && new Date(next.nextStart).toLocaleString(i18n.language, {
    weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return nextTime ? <p className="text-xs text-subtle">{t("reference.schedule.nextLocal", { time: nextTime })}</p> : null;
}
