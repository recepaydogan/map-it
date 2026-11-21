import { CalendarDays, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { gameEventTextKey } from "../../game-config";
import { useGameText } from "../../i18n/game-text";
import { eventCountdown, occurrencesInWindow, type ScheduledEvent } from "../events/event-schedule";
import EventMapAction from "../events/event-map-action";
import EventServerSelector from "../events/event-server-selector";
import { eventServerTimeZone } from "../events/event-server-region";
import { useEventPreferences } from "../events/use-event-preferences";
import { requestMapPointInMain } from "./map-window-bridge";

const LOOKAHEAD_HOURS = 3;

interface MapEventsPanelProps {
  events: ScheduledEvent[];
  status: "loading" | "ready" | "error";
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpenEvents?: () => void;
  top: number;
}

/** A compact view of the same schedule shown on the Events page. */
export default function MapEventsPanel({ events, status, open, onToggle, onClose, onOpenEvents, top }: MapEventsPanelProps) {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const { preferences, update } = useEventPreferences();
  const [now, setNow] = useState(Date.now);
  const timeZone = eventServerTimeZone(preferences.serverRegion);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [open]);

  const occurrences = useMemo(() => !timeZone ? [] : events
    .flatMap((event) => occurrencesInWindow(event, now, now + LOOKAHEAD_HOURS * 3_600_000, timeZone))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.start - b.start || a.event.name.localeCompare(b.event.name)),
  [events, now, timeZone]);

  const localTime = (time: number) => new Date(time).toLocaleTimeString(i18n.language, {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

  return <div className="pointer-events-none absolute bottom-40 right-5 z-40 flex flex-col items-end max-[640px]:right-2.5" style={{ top }} data-app-window-top-controls data-map-ui>
    <div className="map-filter-trigger-frame pointer-events-auto shrink-0">
      <button type="button" data-tour="map-events" onClick={() => { setNow(Date.now()); onToggle(); }} aria-label={t("events.mapPreviewOpen")}
        aria-expanded={open} aria-controls="map-events-panel" title={t("events.mapPreviewOpen")}
        className="map-filter-trigger">
        <CalendarDays size={18} aria-hidden="true" />
      </button>
    </div>
    {open && <section id="map-events-panel" aria-label={t("events.mapPreviewTitle", { hours: LOOKAHEAD_HOURS })}
      className="pointer-events-auto mt-2 flex min-h-0 w-[min(21rem,calc(100vw-2.5rem))] max-h-[28rem] flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/95 shadow-2xl shadow-black/50 backdrop-blur-xl animate-fade-in">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3">
        <CalendarDays size={16} className="shrink-0 text-accent" aria-hidden="true" />
        <h2 className="min-w-0 flex-1 text-sm font-semibold text-zinc-100">{t("events.mapPreviewTitle", { hours: LOOKAHEAD_HOURS })}</h2>
        <button type="button" onClick={onClose} aria-label={t("events.mapPreviewClose")}
          className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-subtle hover:bg-surface-hover hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
          <X size={15} aria-hidden="true" />
        </button>
      </header>
      <div className="shrink-0 border-b border-border px-3 py-2">
        <p className="mb-1 text-[11px] text-subtle">{t("events.gameRegion")}</p>
        <EventServerSelector value={preferences.serverRegion} onChange={(serverRegion) => update({ serverRegion })} />
      </div>
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
        {status !== "ready" ? <p role={status === "error" ? "alert" : "status"} className="px-4 py-6 text-xs text-subtle">{t(status === "error" ? "reference.error" : "reference.loading")}</p>
          : !timeZone ? <p role="status" className="px-4 py-8 text-center text-xs text-subtle">{t("events.regionRequired")}</p>
          : occurrences.length ? <ul className="divide-y divide-border/70">
            {occurrences.map(({ event, active, start, end, entryEnd, entryOpen }) => <li key={`${event.id}:${start}`} className="flex items-start gap-3 px-3 py-2.5">
              <time dateTime={new Date(start).toISOString()} className="w-12 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-accent">{localTime(start)}</time>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium leading-5 text-zinc-100">{gameText(event.name, gameEventTextKey(event.id))}</p>
                <p className="text-[11px] leading-4 text-subtle">{t(`events.types.${event.kind}`)} · {active
                  ? t(entryOpen ? (event.kind === "activity" ? "events.preparationRemaining" : "events.entryClosesIn") : "events.runningRemaining", { time: eventCountdown((entryOpen ? entryEnd : end) - now) })
                  : t("events.startsIn", { time: eventCountdown(start - now) })}</p>
                <div className="mt-0.5 -ml-2">
                  <EventMapAction target={event.mapTarget} entrances={event.mapTargets} onShowMap={({ mapId, markerId }) => {
                    onClose();
                    requestMapPointInMain(markerId, mapId);
                  }} />
                </div>
              </div>
            </li>)}
          </ul> : <p className="px-4 py-8 text-center text-xs text-subtle">{t("events.noUpcomingHint", { hours: LOOKAHEAD_HOURS })}</p>}
      </div>
      {onOpenEvents && <button type="button" onClick={onOpenEvents}
        className="flex shrink-0 cursor-pointer items-center justify-between border-t border-border px-4 py-3 text-xs font-medium text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
        {t("events.mapPreviewViewAll")}<ChevronRight size={15} aria-hidden="true" />
      </button>}
    </section>}
  </div>;
}
