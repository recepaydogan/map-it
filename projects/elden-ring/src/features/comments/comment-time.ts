/**
 * "3d ago" for a note's timestamp.
 *
 * Relative rather than absolute because the only thing a reader wants from the
 * date is how much to trust it — a note written last week and one written in the
 * first month after a patch are different things, and "Mar 4, 21:07" makes you
 * do that subtraction yourself. Intl does the wording, so it stays right in
 * every language the app ships.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export const relativeTime = (iso: string, locale: string): string => {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "";

  // Narrow keeps it to "3d ago", which is all a 360px-wide panel can spare.
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" });
  // Past timestamps are negative deltas; clock skew can put a just-posted note a
  // second into the future, so clamp rather than render "in 1s".
  const delta = Math.min(0, parsed - Date.now());
  const abs = Math.abs(delta);

  if (abs < MINUTE) return format.format(0, "second");
  if (abs < HOUR) return format.format(Math.round(delta / MINUTE), "minute");
  if (abs < DAY) return format.format(Math.round(delta / HOUR), "hour");
  if (abs < MONTH) return format.format(Math.round(delta / DAY), "day");
  if (abs < YEAR) return format.format(Math.round(delta / MONTH), "month");
  return format.format(Math.round(delta / YEAR), "year");
};
