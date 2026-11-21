import { zonedCalendarTime, zonedDayStarts } from "../../lib/zoned-time.ts";

export interface EventMapTarget {
  mapId: string;
  markerId: string;
}

export interface EventMapChoice extends EventMapTarget {
  faction?: string;
  name?: string;
}

interface ScheduledEventBase {
  id: string;
  name: string;
  days: number[];
  minutes: number[];
  target?: { category: string; id: string; name: string };
  /** Known map markers for scheduled activity entrances. */
  mapTargets?: EventMapChoice[];
  /** A known map marker for a scheduled world-boss spawn. */
  mapTarget?: EventMapTarget;
}

interface TimedScheduledEvent extends ScheduledEventBase {
  kind: "activity" | "rift";
  /** Full scheduled run, separate from admission. */
  durationSeconds: number;
  /** Admission window; excludes gameplay after entry closes. */
  entryWindowSeconds: number;
}

/** A spawn timestamp is known, but the boss's lifetime is not. */
interface WorldBossScheduledEvent extends ScheduledEventBase {
  kind: "world-boss";
  durationSeconds: 0;
  entryWindowSeconds: 0;
  region: string;
}

export type ScheduledEvent = TimedScheduledEvent | WorldBossScheduledEvent;

export interface EventOccurrence {
  event: ScheduledEvent;
  start: number;
  end: number;
  entryEnd: number;
  entryOpen: boolean;
  nextStart: number;
  active: boolean;
}

const DAY = 86_400_000;
const startsCache = new WeakMap<ScheduledEvent, Map<string, { calendarDay: number; starts: number[] }>>();

/** Schedules recur in the supplied calendar zone, including its date-specific DST rules. */
function scheduledStarts(event: ScheduledEvent, now: number, timeZone: string, daysAhead: number): number[] {
  const calendarDay = Math.floor(zonedCalendarTime(now, timeZone) / DAY) * DAY;
  const key = `${timeZone}:${daysAhead}`;
  const cache = startsCache.get(event) ?? new Map();
  const cached = cache.get(key);
  if (cached?.calendarDay === calendarDay) return cached.starts;
  const starts: number[] = [];
  const daysBefore = Math.max(1, Math.ceil(event.durationSeconds * 1000 / DAY) + 1);
  for (let day = -daysBefore; day <= daysAhead; day++) {
    const midnight = calendarDay + day * DAY;
    if (!event.days.includes(new Date(midnight).getUTCDay())) continue;
    starts.push(...zonedDayStarts(midnight, event.minutes, timeZone));
  }
  starts.sort((a, b) => a - b);
  if (cache.size >= 16) cache.clear();
  cache.set(key, { calendarDay, starts });
  startsCache.set(event, cache);
  return starts;
}

function occurrenceAt(event: ScheduledEvent, start: number, nextStart: number, now: number): EventOccurrence {
  const end = start + event.durationSeconds * 1000;
  const entryEnd = start + event.entryWindowSeconds * 1000;
  const active = start <= now && now < end;
  return { event, start, end, entryEnd, entryOpen: active && now < entryEnd, nextStart, active };
}

export function nextOccurrence(event: ScheduledEvent, now: number, timeZone: string): EventOccurrence | null {
  const starts = scheduledStarts(event, now, timeZone, 8);
  const nextStart = starts.find((start) => start > now);
  if (nextStart === undefined) return null;
  const activeStart = [...starts].reverse().find((start) => start <= now && now < start + event.durationSeconds * 1000);
  return occurrenceAt(event, activeStart ?? nextStart, nextStart, now);
}

/** Include ongoing runs and every start through the inclusive time horizon. */
export function occurrencesInWindow(event: ScheduledEvent, now: number, until: number, timeZone: string): EventOccurrence[] {
  if (until < now) return [];
  // One extra week supplies the next start for ongoing weekly events.
  const starts = scheduledStarts(event, now, timeZone, Math.ceil((until - now) / DAY) + 8);
  const nextStart = starts.find((start) => start > now);
  if (nextStart === undefined) return [];
  return starts.filter((start) => start <= until && (start >= now || start + event.durationSeconds * 1000 > now))
    .map((start) => occurrenceAt(event, start, start > now ? start : nextStart, now));
}

export function eventCountdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  return (parts[0] ? parts : parts.slice(1)).map((part) => String(part).padStart(2, "0")).join(":");
}

export function reminderKey(occurrence: EventOccurrence, timeZone: string): string {
  return `${timeZone}:${occurrence.event.id}:${occurrence.nextStart}`;
}
