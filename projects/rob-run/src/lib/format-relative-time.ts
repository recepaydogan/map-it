const formatters = new Map<string, Intl.RelativeTimeFormat>();

/** Snapshot timestamps are Unix seconds. Future clock skew is displayed as now. */
export function formatRelativeTime(timestamp: number, language: string, now = Date.now()): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "—";
  let formatter = formatters.get(language);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(language, { numeric: "always" });
    formatters.set(language, formatter);
  }
  const seconds = Math.max(0, Math.floor((now - timestamp * 1000) / 1000));
  if (seconds < 60) return new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(0, "second");
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 86400], ["month", 30 * 86400], ["day", 86400], ["hour", 3600], ["minute", 60],
  ];
  const [unit, duration] = units.find(([, duration]) => seconds >= duration)!;
  return formatter.format(-Math.floor(seconds / duration), unit);
}
