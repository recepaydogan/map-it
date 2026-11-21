import { Bell, CalendarDays, ScrollText, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { gameEventTextKey } from "../../game-config";
import CategoryDropdown from "../../components/category-dropdown";
import { cn } from "../../lib/cn";
import { unlockEventAudio } from "./event-audio";
import { nextOccurrence, occurrencesInWindow, type EventMapTarget, type EventOccurrence, type ScheduledEvent } from "./event-schedule";
import EventReminderSettings from "./event-reminder-settings";
import EventRegionIntro from "./event-region-intro";
import EventTimeGroup from "./event-time-group";
import EventMissionsPanel from "./event-missions-panel";
import { EVENT_GUIDE_NAVIGATION_EVENT, EVENT_MISSIONS_NAVIGATION_EVENT, EVENT_SCHEDULE_NAVIGATION_EVENT, type EventGuideTarget } from "./event-mission-navigation";
import { eventServerTimeZone } from "./event-server-region";
import { useEventCatalog } from "./use-event-catalog";
import { useEventPreferences } from "./use-event-preferences";
import { useEventReminders } from "./use-event-reminders";

const LOOKAHEAD_HOURS = 12;
type EventKindFilter = "all" | ScheduledEvent["kind"];
const EVENT_KIND_FILTERS: EventKindFilter[] = ["all", "activity", "rift", "world-boss"];

/** Remains mounted across dashboard pages so reminders keep running. */
export default function EventsWorkspace({ active, alertsOwner, onShowMap }: { active: boolean; alertsOwner: boolean; onShowMap: (target: EventMapTarget) => void }) {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const [remindersOnly, setRemindersOnly] = useState(false);
  const [eventKind, setEventKind] = useState<EventKindFilter>("all");
  const [section, setSection] = useState<"schedule" | "missions">("schedule");
  const [halloweenView, setHalloweenView] = useState<"guide" | "missions">("guide");
  const [guideScrollTarget, setGuideScrollTarget] = useState<EventGuideTarget | null>(null);
  const completeGuideScroll = useCallback(() => setGuideScrollTarget(null), []);
  const changeHalloweenView = useCallback((view: "guide" | "missions") => {
    setGuideScrollTarget(null);
    setHalloweenView(view);
  }, []);
  useEffect(() => {
    const showMissions = () => { setGuideScrollTarget(null); setHalloweenView("missions"); setSection("missions"); };
    const showGuide = (event: Event) => {
      setGuideScrollTarget((event as CustomEvent<EventGuideTarget | undefined>).detail ?? null);
      setHalloweenView("guide");
      setSection("missions");
    };
    const showSchedule = () => { setGuideScrollTarget(null); setSection("schedule"); };
    window.addEventListener(EVENT_MISSIONS_NAVIGATION_EVENT, showMissions);
    window.addEventListener(EVENT_GUIDE_NAVIGATION_EVENT, showGuide);
    window.addEventListener(EVENT_SCHEDULE_NAVIGATION_EVENT, showSchedule);
    return () => {
      window.removeEventListener(EVENT_MISSIONS_NAVIGATION_EVENT, showMissions);
      window.removeEventListener(EVENT_GUIDE_NAVIGATION_EVENT, showGuide);
      window.removeEventListener(EVENT_SCHEDULE_NAVIGATION_EVENT, showSchedule);
    };
  }, []);
  const { events, status } = useEventCatalog();
  const { preferences, error, update } = useEventPreferences();
  const serverTimeZone = eventServerTimeZone(preferences.serverRegion);
  const { now, notice, dismiss, audioError, setAudioError } = useEventReminders(events, { ...preferences, timeZone: serverTimeZone, owner: alertsOwner });
  const groups = useMemo(() => {
    if (!serverTimeZone) return [];
    const until = now + LOOKAHEAD_HOURS * 3_600_000;
    const occurrences = events.filter((event) => (eventKind === "all" || event.kind === eventKind)
      && (!remindersOnly || preferences.enabled.includes(event.id)))
      .flatMap((event) => {
        if (eventKind === "world-boss" && event.kind === "world-boss") {
          const next = nextOccurrence(event, now, serverTimeZone);
          return next ? [next] : [];
        }
        return occurrencesInWindow(event, now, until, serverTimeZone);
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
  }, [events, now, serverTimeZone, remindersOnly, preferences.enabled, eventKind]);
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
    {active && <div className="@container catalog-page-frame flex flex-col animate-fade-in">
      <header className="catalog-page-header shrink-0 border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex h-10 items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-border bg-background"><CalendarDays size={18} className="text-accent" aria-hidden="true" /></div>
              <h1 className="text-lg font-semibold tracking-tight text-zinc-100">{t("events.tab")}</h1>
            </div>
            {section === "schedule" && serverTimeZone && <p className="mt-2 text-xs text-subtle">{t("events.timesInLocal")}</p>}
          </div>
          {section === "schedule" && <div className="flex items-end gap-2">
            <EventRegionIntro value={preferences.serverRegion} onChange={(serverRegion) => update({ serverRegion })} />
            <EventReminderSettings preferences={preferences} update={update} onAudioError={audioFailure} onTest={() => setAudioError(false)} />
          </div>}
        </div>
      </header>
      <nav className="flex shrink-0 gap-1 border-b border-border px-4 @min-[720px]:px-8" aria-label={t("events.missions.sectionsLabel")}>
        <button type="button" onClick={() => setSection("schedule")} aria-current={section === "schedule" ? "page" : undefined} className={cn("-mb-px inline-flex h-11 cursor-pointer items-center gap-2 border-b-2 px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-accent", section === "schedule" ? "border-accent text-white" : "border-transparent text-zinc-300 hover:text-white")}><CalendarDays size={15} aria-hidden="true" />{t("events.missions.scheduleTab")}</button>
        <button type="button" onClick={() => setSection("missions")} aria-current={section === "missions" ? "page" : undefined} className={cn("-mb-px inline-flex h-11 cursor-pointer items-center gap-2 border-b-2 px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-accent", section === "missions" ? "border-accent text-white" : "border-transparent text-zinc-300 hover:text-white")}><ScrollText size={15} aria-hidden="true" />{t("events.missions.tab")}</button>
      </nav>
      {section === "missions" ? <EventMissionsPanel onShowMap={onShowMap} view={halloweenView}
        guideScrollTarget={guideScrollTarget} onGuideScrollComplete={completeGuideScroll}
        onChangeView={changeHalloweenView} /> : <>
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
            : !serverTimeZone ? <p role="status" className="py-16 text-center text-sm text-subtle">{t("events.regionRequired")}</p>
            : groups.length ? <div className="space-y-9">{groups.map(([key, entries]) => <EventTimeGroup key={key} entries={entries} now={now} enabled={preferences.enabled} onToggle={toggleReminder} localTime={localTime} onShowMap={onShowMap} />)}</div>
              : <div className="py-16 text-center"><Bell size={24} className="mx-auto mb-4 text-accent" aria-hidden="true" /><h2 className="text-sm font-medium text-zinc-100">{t(remindersOnly && !preferences.enabled.length ? "events.noReminders" : "events.noUpcoming")}</h2><p className="mt-2 text-xs text-subtle">{t(remindersOnly && !preferences.enabled.length ? "events.noRemindersHint" : eventKind === "world-boss" ? "events.noUpcomingBosses" : "events.noUpcomingHint", { hours: LOOKAHEAD_HOURS })}</p></div>}
          <p className="mt-8 border-t border-border pt-4 text-[11px] leading-5 text-subtle">{t("events.scheduleNote")}</p>
        </div>
      </div></>}
    </div>}
    {notice && <div role="status" className="absolute bottom-4 right-4 z-[1450] max-w-[min(352px,calc(100%-32px))] rounded-[var(--radius-md)] border border-accent/40 bg-surface p-3 shadow-xl">
      <div className="flex items-center gap-2"><Bell size={16} className="text-accent" aria-hidden="true" /><p className="flex-1 text-sm font-semibold text-zinc-100">{t("events.reminderAt", { time: localTime(notice.start) })}</p><button type="button" onClick={dismiss} aria-label={t("events.dismissReminder")} className="cursor-pointer p-1 text-subtle"><X size={15} /></button></div>
      <p className="mt-2 text-xs leading-5 text-zinc-200">{notice.events.map(({ id, name }) => gameText(name, gameEventTextKey(id))).join(", ")}</p>
      {audioError && <p className="mt-1 text-xs text-danger-text">{t("events.audioError")}</p>}
    </div>}
  </>;
}
