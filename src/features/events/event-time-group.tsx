import { Bell, BellRing, ChevronRight, Skull, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { openReference } from "../reference/reference-navigation";
import { eventCountdown, type EventMapTarget, type EventOccurrence } from "./event-schedule";
import EventMapAction from "./event-map-action";

export default function EventTimeGroup({ entries, now, enabled, onToggle, localTime, onShowMap }: {
  entries: EventOccurrence[]; now: number; enabled: string[];
  onToggle: (id: string) => void; localTime: (time: number) => string;
  onShowMap: (target: EventMapTarget) => void;
}) {
  const { t, i18n } = useTranslation();
  const first = entries[0]!;
  const day = new Date(first.start).toDateString() === new Date(now).toDateString() ? t("events.today")
    : new Date(first.start).toLocaleDateString(i18n.language, { weekday: "short", month: "short", day: "numeric" });
  return <section className="grid gap-3 @min-[620px]:grid-cols-[90px_minmax(0,1fr)] @min-[620px]:gap-7">
    <div className="flex items-baseline gap-3 pt-1 @min-[620px]:block">
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-zinc-100">{localTime(first.start)}</p>
      <p className="mt-1 text-xs text-subtle">{day}</p>
    </div>
    <div className="min-w-0 border-l border-border pl-5">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pb-2">
        <h2 className="text-sm font-medium text-accent">{t(first.active ? "events.scheduledNow" : "events.startsIn", { time: eventCountdown(first.start - now) })}</h2>
        <span className="text-xs tabular-nums text-subtle">{t("events.groupCount", { count: entries.length })}</span>
      </header>
      <div className="grid gap-x-8 @min-[840px]:grid-cols-2">
        {entries.map(({ event, active, start, end, entryEnd, entryOpen }) => {
          const subscribed = enabled.includes(event.id);
          const ReminderIcon = subscribed ? BellRing : Bell;
          const worldBoss = event.kind === "world-boss";
          return <div key={event.id} className="flex min-h-14 items-center gap-2 border-b border-border/70 py-2">
            <div className="min-w-0 flex-1">
              {event.target ? <button type="button" onClick={() => openReference(event.target!)} className="group flex max-w-full cursor-pointer items-center gap-2 text-left text-[13px] font-medium leading-5 text-zinc-100 hover:text-accent"><span>{event.name}</span><ChevronRight size={13} className="shrink-0 text-subtle group-hover:text-accent" aria-hidden="true" /></button>
                : <p className="flex items-center gap-2 text-[13px] font-medium leading-5 text-zinc-100"><Zap size={13} className="shrink-0 text-accent" aria-hidden="true" />{event.name}</p>}
              {worldBoss
                ? <p className="flex items-center gap-1.5 text-[11px] leading-5 text-subtle"><Skull size={12} className="shrink-0 text-accent" aria-hidden="true" />{t("events.worldBossSpawn", { region: event.region, time: localTime(start) })}</p>
                : <p className="text-[11px] leading-5 text-subtle">{t(event.kind === "activity" ? "events.activityWindow" : "events.eventWindow", { start: localTime(start), end: localTime(end) })}</p>}
              {active && !worldBoss && <p className="text-[11px] leading-5 text-accent">{t(entryOpen ? (event.kind === "activity" ? "events.preparationRemaining" : "events.entryClosesIn") : "events.runningRemaining", { time: eventCountdown((entryOpen ? entryEnd : end) - now) })}</p>}
            </div>
            <EventMapAction target={event.mapTarget} entrances={event.mapTargets} onShowMap={onShowMap} />
            <button type="button" aria-pressed={subscribed} aria-label={t("events.remindFor", { name: event.name })} title={t(subscribed ? "events.reminderEnabled" : "events.remindFor", { name: event.name })} onClick={() => onToggle(event.id)}
              className={cn("grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] transition-colors focus-visible:outline-2 focus-visible:outline-accent", subscribed ? "bg-accent-soft text-accent" : "text-subtle hover:bg-surface-hover hover:text-zinc-100")}><ReminderIcon size={15} aria-hidden="true" /></button>
          </div>;
        })}
      </div>
    </div>
  </section>;
}
