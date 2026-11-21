import { Bell, CalendarDays, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { cn } from "../../lib/cn";
import { unlockEventAudio } from "./event-audio";
import { nextOccurrence, occurrencesInWindow, type EventMapTarget, type EventOccurrence, type ScheduledEvent } from "./event-schedule";
import EventReminderSettings from "./event-reminder-settings";
import EventTimeGroup from "./event-time-group";
import { useEventCatalog } from "./use-event-catalog";
import { useEventPreferences } from "./use-event-preferences";
import { useEventReminders } from "./use-event-reminders";

const LOOKAHEAD_HOURS = 12;
type EventKindFilter = "all" | ScheduledEvent["kind"];
const EVENT_KIND_FILTERS: EventKindFilter[] = ["all", "activity", "rift", "world-boss"];

/** Remains mounted across dashboard pages so reminders keep running. */
export default function EventsWorkspace({ active, alertsOwner, onShowMap }: { active: boolean; alertsOwner: boolean; onShowMap: (target: EventMapTarget) => void }) {
  const { t, i18n } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [remindersOnly, setRemindersOnly] = useState(false);
  const [eventKind, setEventKind] = useState<EventKindFilter>("all");
  const { events, status } = useEventCatalog();
  const { preferences, error, update } = useEventPreferences();
  const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { now, notice, dismiss, audioError, setAudioError } = useEventReminders(events, { ...preferences, timeZone: deviceTimeZone, owner: alertsOwner });
  const groups = useMemo(() => {
    const until = now + LOOKAHEAD_HOURS * 3_600_000;
    const occurrences = events.filter((event) => (eventKind === "all" || event.kind === eventKind)
      && (!remindersOnly || preferences.enabled.includes(event.id)))
      .flatMap((event) => {
        if (eventKind === "world-boss" && event.kind === "world-boss") {
          const next = nextOccurrence(event, now, deviceTimeZone);
          return next ? [next] : [];
        }
        return occurrencesInWindow(event, now, until, deviceTimeZone);
      })
      .sort((a, b) => Number(b.active) - Number(a.active) || a.start - b.start || a.event.name.localeCompare(b.event.name));
    const grouped = new Map<string, EventOccurrence[]>();
    for (const occurrence of occurrences) {
      const key = `${occurrence.active}:${occurrence.start}`;
      const group = grouped.get(key) ?? [];
      group.push(occurrence);
      grouped.set(key, group);
    }
    return [...grouped.entries()];
  }, [events, now, deviceTimeZone, remindersOnly, preferences.enabled, eventKind]);
  const audioFailure = (failure: unknown) => { console.error("Event audio unavailable", failure); setAudioError(true); };
  const localTime = (time: number) => new Date(time).toLocaleTimeString(i18n.language, {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const toggleReminder = (id: string) => {
    const enabled = !preferences.enabled.includes(id);
    update({ enabled: enabled ? [...preferences.enabled, id] : preferences.enabled.filter((key) => key !== id) });
    if (enabled && preferences.sound !== "off") void unlockEventAudio().catch(audioFailure);
  };
  return <>
    {active && <div className="@container absolute inset-0 flex flex-col bg-background animate-fade-in">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-4">
        <div className="flex min-w-0 basis-64 items-center gap-3 @min-[620px]:flex-1">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft"><CalendarDays size={18} className="text-accent" aria-hidden="true" /></div>
          <div className="min-w-0"><h1 className="text-lg font-semibold tracking-tight text-zinc-100">{t("events.tab")}</h1></div>
        </div>
        <button type="button" aria-label={t("events.reminderSettings")} title={t("events.reminderSettings")} aria-expanded={settingsOpen} aria-controls="event-reminder-settings" onClick={() => setSettingsOpen((current) => !current)} className={cn("grid h-10 w-10 cursor-pointer place-items-center rounded-[var(--radius-sm)] border transition-colors", settingsOpen ? "border-accent/30 bg-accent-soft text-accent" : "border-border text-subtle hover:bg-surface-hover hover:text-white")}><SlidersHorizontal size={17} aria-hidden="true" /></button>
      </header>
      {settingsOpen && <EventReminderSettings preferences={preferences} update={update} onAudioError={audioFailure} onTest={() => setAudioError(false)} />}
      {(error || audioError) && <p role="alert" className="border-b border-border px-6 py-3 text-xs text-danger-text">{t(error ? "events.storageError" : "events.audioError")}</p>}
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-6 py-6 @min-[840px]:px-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-border">
            <div className="flex gap-5" role="group" aria-label={t("events.filter")}>
              {[false, true].map((only) => <button key={String(only)} type="button" aria-pressed={remindersOnly === only} onClick={() => setRemindersOnly(only)} className={cn("-mb-px flex h-10 cursor-pointer items-center gap-2 border-b-2 text-xs font-medium", remindersOnly === only ? "border-accent text-accent" : "border-transparent text-subtle hover:text-white")}>{only && <Bell size={13} aria-hidden="true" />}{t(only ? "events.myReminders" : "events.allEvents")}{only && <span className="tabular-nums">{preferences.enabled.length}</span>}</button>)}
            </div>
            <div className="ml-auto w-44 max-w-full pb-2"><CategoryDropdown ariaLabel={t("events.typeFilter")}
              value={eventKind} onChange={(kind) => setEventKind(kind as EventKindFilter)}
              options={EVENT_KIND_FILTERS.map((kind) => ({ key: kind, label: t(`events.types.${kind}`) }))} /></div>
          </div>
          {status !== "ready" ? <p role={status === "error" ? "alert" : "status"} className="py-8 text-sm text-subtle">{t(status === "error" ? "reference.error" : "reference.loading")}</p>
            : groups.length ? <div className="space-y-9">{groups.map(([key, entries]) => <EventTimeGroup key={key} entries={entries} now={now} enabled={preferences.enabled} onToggle={toggleReminder} localTime={localTime} onShowMap={onShowMap} />)}</div>
              : <div className="py-16 text-center"><Bell size={24} className="mx-auto mb-4 text-accent" aria-hidden="true" /><h2 className="text-sm font-medium text-zinc-100">{t(remindersOnly && !preferences.enabled.length ? "events.noReminders" : "events.noUpcoming")}</h2><p className="mt-2 text-xs text-subtle">{t(remindersOnly && !preferences.enabled.length ? "events.noRemindersHint" : eventKind === "world-boss" ? "events.noUpcomingBosses" : "events.noUpcomingHint", { hours: LOOKAHEAD_HOURS })}</p></div>}
          <p className="mt-8 border-t border-border pt-4 text-[11px] leading-5 text-subtle">{t("events.scheduleNote")}</p>
        </div>
      </div>
    </div>}
    {notice && <div role="status" className="absolute bottom-4 right-4 z-[1450] max-w-[min(352px,calc(100%-32px))] rounded-[var(--radius-md)] border border-accent/40 bg-surface p-3 shadow-xl">
      <div className="flex items-center gap-2"><Bell size={16} className="text-accent" aria-hidden="true" /><p className="flex-1 text-sm font-semibold text-zinc-100">{t("events.reminderAt", { time: localTime(notice.start) })}</p><button type="button" onClick={dismiss} aria-label={t("events.dismissReminder")} className="cursor-pointer p-1 text-subtle"><X size={15} /></button></div>
      <p className="mt-2 text-xs leading-5 text-zinc-200">{notice.names.join(", ")}</p>
      {audioError && <p className="mt-1 text-xs text-danger-text">{t("events.audioError")}</p>}
    </div>}
  </>;
}
