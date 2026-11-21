import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export const useSavedPositionAge = (savedAt: number | undefined) => {
  const { i18n } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (savedAt === undefined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [savedAt]);

  if (savedAt === undefined) return "";
  const seconds = Math.max(0, Math.floor((now - savedAt) / 1000));
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [31_536_000, "year"], [2_592_000, "month"], [86_400, "day"],
    [3_600, "hour"], [60, "minute"], [1, "second"],
  ];
  const [duration, unit] = units.find(([duration]) => seconds >= duration) ?? [1, "second"];
  return new Intl.RelativeTimeFormat(i18n.resolvedLanguage ?? i18n.language, { numeric: "always", style: "narrow" })
    .format(-Math.floor(seconds / duration), unit);
};
