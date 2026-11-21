/** Format the server's timestamp in the reader's device time zone on both sides. */
export const formatSupportTime = (iso: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
    // Language controls wording; the device controls the time zone.
    // Resolve on each call so a device time-zone change is not cached here.
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "shortOffset",
  }).format(new Date(iso));
