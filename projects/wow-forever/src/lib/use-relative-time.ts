import { useEffect, useState } from "react";
import { formatRelativeTime } from "./format-relative-time";

/** Refresh elapsed labels while a page is open, including after returning to it. */
export function useRelativeTime(language: string) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  return (timestamp: number) => formatRelativeTime(timestamp, language, now);
}
