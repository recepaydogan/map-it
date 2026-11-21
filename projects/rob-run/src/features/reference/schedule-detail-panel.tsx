import { CalendarDays, Clock3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ReferenceLinks } from "./reference-sections";
import SchedulePreview from "../events/schedule-preview";
import type { ReferenceEntry, ReferenceLink } from "./reference-types";
import { scheduleActivities } from "./schedule-activities";
import { useReferenceIndex } from "./use-reference-data";

export default function ScheduleDetailPanel({ entry }: { entry: ReferenceEntry }) {
  const { t, i18n } = useTranslation();
  const index = useReferenceIndex();
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const facts = entry.sections.find(section => section.title === "reference.labels.scheduled-days")?.facts ?? [];
  const days = weekdays.flatMap((day, value) => facts.some(fact => fact.label === `reference.labels.${day}` && fact.value === true) ? [value] : []);
  const daysText = days.length === 7 ? t("reference.schedule.everyDay") : days.length
    ? days.sort((a, b) => (a || 7) - (b || 7)).map(day => new Intl.DateTimeFormat(i18n.language, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + day)))).join(" · ")
    : t("reference.schedule.noDays");
  const rawTimes = entry.sections.find(section => section.title === "reference.labels.client-schedule-times-timezone-unverified")?.text ?? "";
  const times = [...new Set(rawTimes.split(/,\s*/).filter(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)))].sort();
  const hourly = times.length === 24 && times.every((time, hour) => Number(time.slice(0, 2)) === hour && time.slice(3) === times[0]!.slice(3));
  const timeText = hourly ? t(times[0]!.endsWith(":00") ? "reference.schedule.hourly" : "reference.schedule.hourlyMinute", { minute: times[0]!.slice(3) }) : times.join(" · ") || t("reference.schedule.noTimes");
  const summaries = new Map(index.status === "ready" ? index.data.entries.map(summary => [summary.id, summary]) : []);
  const links = new Map<string, ReferenceLink>();
  for (const link of scheduleActivities(entry)) {
    const family = summaries.get(link.id)?.activity?.familyId ?? link.id;
    if (!links.has(family)) links.set(family, link);
  }
  return <div className="space-y-5">
    <div className="rounded-[var(--radius-md)] border border-accent/20 bg-surface p-4">
      <div className="flex items-center gap-2 text-sm text-zinc-200"><CalendarDays size={16} className="shrink-0 text-accent" aria-hidden="true" />{daysText}</div>
      <div className="mt-3 flex items-start gap-2 text-lg font-medium text-white"><Clock3 size={18} className="mt-1 shrink-0 text-accent" aria-hidden="true" /><p className="tabular-nums">{timeText}</p></div>
      {hourly && <p className="mt-2 text-xs text-subtle">{t("reference.schedule.dailyCount", { count: times.length })}</p>}
      <div className="mt-3"><SchedulePreview days={days} minutes={times.map((time) =>
        Number(time.slice(0, 2)) * 60 + Number(time.slice(3)))} /></div>
    </div>
    {index.status === "error" ? <p role="alert" className="text-sm text-subtle">{t("reference.error")}</p>
      : index.status === "loading" ? <p role="status" className="text-sm text-subtle">{t("reference.loading")}</p>
        : links.size > 0 && <ReferenceLinks links={[...links.values()]} />}
    <p className="text-xs leading-relaxed text-subtle">{t("reference.schedule.deviceClockNotice")}</p>
  </div>;
}
