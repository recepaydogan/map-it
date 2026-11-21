import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import type { ReferenceEntry } from "./reference-types";
import SchedulePreview from "../events/schedule-preview";

const WorldBossSchedule = ({ entry }: { entry: ReferenceEntry }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const scheduledRecords = entry.worldBoss?.filter((record) => record.schedule) ?? [];
  if (!scheduledRecords.length) return null;
  const dayName = (day: number) => new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + day)));
  const scheduleMinutes = (time: string, cycle: number, kind: string) => {
    const [hour, minute] = time.split(":").map(Number);
    const start = hour! * 60 + minute!;
    if (!Number.isFinite(start) || start < 0 || start >= 1440) return [];
    if (kind !== "Cycle") return [start];
    if (cycle <= 0) return [];
    return Array.from({ length: Math.ceil((1440 - start) / cycle) }, (_, index) => start + index * cycle);
  };
  const cycleTimes = (time: string, cycle: number) => {
    const [hour, minute] = time.split(":").map(Number);
    const start = hour! * 60 + minute!;
    if (!Number.isFinite(start) || cycle <= 0) return time;
    return Array.from({ length: Math.ceil((1440 - start) / cycle) }, (_, index) => {
      const total = start + index * cycle;
      return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    }).join(" · ");
  };
  return <section className="space-y-3 rounded-[var(--radius-md)] border border-border bg-surface p-4" aria-label={t("reference.boss.schedule")}>
    {scheduledRecords.map((record, index) => <div key={`${record.mapId}-${index}`}>
      <h3 className="text-sm font-semibold text-zinc-100">{gameText(record.region)}</h3>
      <p className="mt-1 text-sm tabular-nums text-accent">{record.schedule?.kind === "Day"
        ? `${record.schedule.days.map(dayName).join(" · ")} · ${record.schedule.time}`
        : record.schedule?.kind === "Cycle"
          ? cycleTimes(record.schedule.time, record.schedule.cycle)
          : t("reference.boss.interval")}</p>

      {record.schedule && <div className="mt-2"><SchedulePreview days={record.schedule.days}
        minutes={scheduleMinutes(record.schedule.time, record.schedule.cycle, record.schedule.kind)} /></div>}
      {record.schedule?.kind === "Cycle" && <p className="mt-1 text-xs text-subtle">{t("reference.boss.rawCycle", { count: record.schedule.cycle })}</p>}
    </div>)}
    {scheduledRecords.every(record => record.berserkEnabled === false) && <p className="border-t border-border pt-3 text-xs text-subtle">{t("reference.boss.berserkDisabled")}</p>}
    <p className="text-xs leading-5 text-subtle">{t("reference.boss.deviceClockNotice")}</p>
  </section>;
};

export default WorldBossSchedule;
