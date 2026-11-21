const DAY = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

/** Encode a zone's calendar fields as UTC fields, for calendar arithmetic only. */
export function zonedCalendarTime(instant: number, timeZone: string): number {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone, calendar: "gregory", numberingSystem: "latn", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(({ type, value }) => [type, value]));
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
}

/** Resolve a calendar day's wall-clock minutes to real instants using that date's offsets. */
export function zonedDayStarts(calendarDay: number, minutes: number[], timeZone: string): number[] {
  // Sample both sides of a possible transition, including zones ahead of UTC.
  const offsets = new Set([-DAY, 0, DAY, 2 * DAY].map((delta) => {
    const instant = calendarDay + delta;
    return zonedCalendarTime(instant, timeZone) - instant;
  }));
  return minutes.flatMap((minute) => {
    const wallTime = calendarDay + minute * 60_000;
    // Spring gaps have no matching instant. Autumn folds have two; retain both.
    return [...offsets].map((offset) => wallTime - offset)
      .filter((instant) => zonedCalendarTime(instant, timeZone) === wallTime);
  });
}
