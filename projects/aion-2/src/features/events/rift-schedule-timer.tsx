import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import { eventCountdown, nextOccurrence, type ScheduledEvent } from "./event-schedule";
import EventServerSelector from "./event-server-selector";
import { eventServerTimeZone } from "./event-server-region";
import { useEventPreferences } from "./use-event-preferences";
import type { ScheduleData } from "../intelligence/intelligence-types";

type RiftSchedule = ScheduleData["schedules"][number];

export default function RiftScheduleTimer({ schedule, withDivider = false }: {
  schedule: RiftSchedule;
  withDivider?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { preferences, update } = useEventPreferences();
  const timeZone = eventServerTimeZone(preferences.serverRegion);
  const [now, setNow] = useState(Date.now);
  const event = useMemo<ScheduledEvent>(() => ({
    id: schedule.id,
    name: schedule.name,
    kind: "rift",
    days: schedule.days,
    minutes: schedule.minutes,
    durationSeconds: 0,
    entryWindowSeconds: 0,
  }), [schedule]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const next = timeZone ? nextOccurrence(event, now, timeZone) : null;

  const nextTime = next && new Date(next.nextStart).toLocaleString(i18n.language, {
    weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const cadence = schedule.cycleMinutes
    ? schedule.cycleMinutes % 60 === 0
      ? t("map.riftSchedule.everyHours", { count: schedule.cycleMinutes / 60 })
      : t("map.riftSchedule.everyMinutes", { count: schedule.cycleMinutes })
    : null;

  return <section className={withDivider ? "border-t border-border pt-4" : undefined}>
    <DatabaseSectionTitle>{t("map.riftSchedule.title")}</DatabaseSectionTitle>
    <div className="mb-3 w-56 max-w-full"><EventServerSelector value={preferences.serverRegion} onChange={(serverRegion) => update({ serverRegion })} /></div>
    {!next ? <p className="text-xs text-subtle">{t("events.regionRequired")}</p> : <div className="rounded-[var(--radius-md)] border border-border bg-surface px-3.5 py-3">
      <p className="text-[11px] leading-4 text-subtle">{t("map.riftSchedule.nextStart")}</p>
      <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <p role="timer" aria-live="off" className="font-semibold tabular-nums text-[24px] leading-none tracking-tight text-zinc-100">
          {eventCountdown(next.nextStart - now)}
        </p>
        <time dateTime={new Date(next.nextStart).toISOString()} className="pb-0.5 text-xs font-medium tabular-nums text-accent">
          {nextTime}
        </time>
      </div>
      {cadence && <p className="mt-3 border-t border-border pt-2 text-xs text-subtle">{cadence}</p>}
    </div>}
  </section>;
}
