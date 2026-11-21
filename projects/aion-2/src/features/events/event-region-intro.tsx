import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EventServerRegion } from "../../game-config";
import EventServerSelector from "./event-server-selector";

const STORAGE_KEY = "gm:event-region-intro-v1";
const GLOW_DURATION_MS = 30_000;

const initialGlowDeadline = (): number => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "done") return 0;
    const now = Date.now();
    const storedStart = saved ? Number(saved) : NaN;
    const started = Number.isFinite(storedStart) && storedStart > 0 && storedStart <= now ? storedStart : now;
    if (started === now) localStorage.setItem(STORAGE_KEY, String(started));
    return started + GLOW_DURATION_MS > now ? started + GLOW_DURATION_MS : 0;
  } catch (error) {
    console.warn("Could not read event region intro state", error);
    return Date.now() + GLOW_DURATION_MS;
  }
};

const finishIntro = () => {
  try { localStorage.setItem(STORAGE_KEY, "done"); }
  catch (error) { console.warn("Could not save event region intro state", error); }
};

export default function EventRegionIntro({ value, onChange }: {
  value: EventServerRegion | null;
  onChange: (region: EventServerRegion | null) => void;
}) {
  const { t } = useTranslation();
  const [glowDeadline, setGlowDeadline] = useState(initialGlowDeadline);

  useEffect(() => {
    if (!glowDeadline) return;
    const timer = window.setTimeout(() => {
      setGlowDeadline(0);
      finishIntro();
    }, Math.max(0, glowDeadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [glowDeadline]);

  const dismissGlow = () => {
    if (!glowDeadline) return;
    setGlowDeadline(0);
    finishIntro();
  };

  return <div className="w-52 max-w-full shrink-0">
    <p className="mb-1 text-[11px] text-subtle">{t("events.gameRegion")}</p>
    <div className="relative" onPointerDownCapture={dismissGlow} onClickCapture={dismissGlow}>
      {glowDeadline > 0 && <span aria-hidden="true" className="pointer-events-none absolute -inset-1 rounded-[var(--radius-md)] border-2 border-accent/80 shadow-[0_0_20px_var(--color-accent)] animate-pulse motion-reduce:animate-none" />}
      <EventServerSelector value={value} onChange={onChange} />
    </div>
  </div>;
}
