import { ArrowRight, LocateFixed, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_CONFIG } from "../../game-config";
import { shouldAutoStartOnboarding, useOnboardingActive } from "../onboarding/use-onboarding";

const DISMISSED_KEY = `${GAME_CONFIG.appName}:live-position-discovery-dismissed:v1`;

const readDismissed = () => {
  try { return localStorage.getItem(DISMISSED_KEY) === "1"; }
  catch (error) { console.warn("Could not read live position discovery state", error); return false; }
};

export default function LivePositionDiscoveryCard({ onOpenMap, onReminderHeightChange }: { onOpenMap: () => void; onReminderHeightChange: (height: number) => void }) {
  const { t } = useTranslation();
  const onboardingActive = useOnboardingActive();
  const [open, setOpen] = useState(() => !readDismissed());
  const reminderRef = useRef<HTMLButtonElement>(null);
  const hidden = onboardingActive || shouldAutoStartOnboarding();

  useLayoutEffect(() => {
    const reminder = reminderRef.current;
    if (hidden || open || !reminder) { onReminderHeightChange(0); return; }
    const measure = () => onReminderHeightChange(Math.ceil(reminder.getBoundingClientRect().height));
    const observer = new ResizeObserver(measure);
    observer.observe(reminder);
    measure();
    return () => { observer.disconnect(); onReminderHeightChange(0); };
  }, [hidden, open, onReminderHeightChange]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === DISMISSED_KEY || event.key === null) setOpen(!readDismissed());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    setOpen(false);
    try { localStorage.setItem(DISMISSED_KEY, "1"); }
    catch (error) { console.warn("Could not save live position discovery state", error); }
  };

  const openMap = () => {
    dismiss();
    onOpenMap();
  };

  if (!open) return <button ref={reminderRef} type="button" onClick={() => setOpen(true)} className="absolute bottom-5 left-5 z-30 max-w-[calc(100%-2.5rem)] cursor-pointer rounded-[var(--radius-md)] border border-border bg-surface/95 px-3 py-2 text-left text-xs font-semibold text-zinc-100 shadow-lg shadow-black/40 backdrop-blur transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{t("map.livePosition.discovery.reopen")}</button>;

  return <div className="absolute inset-0 z-[1600] flex items-center justify-center bg-black/50 p-5">
    <section role="dialog" aria-modal="false" aria-labelledby="live-position-discovery-title" aria-describedby="live-position-discovery-body live-position-discovery-admin" className="relative w-full max-w-[26rem] overflow-hidden rounded-[var(--radius-lg)] border border-accent/45 bg-surface/95 p-5 shadow-2xl shadow-black/50 backdrop-blur-xl">
      <div aria-hidden="true" className="pointer-events-none absolute -left-10 -top-14 size-36 rounded-full bg-accent/10 blur-2xl" />
      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent"><LocateFixed size={14} aria-hidden="true" />{t("map.livePosition.discovery.kicker")}</span>
          <button type="button" onClick={dismiss} aria-label={t("map.livePosition.discovery.dismiss")} className="-mr-1 -mt-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-zinc-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-accent"><X size={15} aria-hidden="true" /></button>
        </div>
        <h2 id="live-position-discovery-title" className="mt-2 font-display text-xl font-semibold leading-tight text-white">{t("map.livePosition.discovery.title")}</h2>
        <p id="live-position-discovery-body" className="mt-2 text-[13px] leading-5 text-zinc-200">{t("map.livePosition.discovery.body")}</p>
        <p id="live-position-discovery-admin" className="mt-2 text-xs leading-5 text-zinc-400">{t("map.livePosition.discovery.adminStep")}</p>
        <button type="button" onClick={openMap} className="mt-5 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] bg-accent px-3 text-xs font-semibold text-background transition-colors hover:bg-accent/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{t("map.livePosition.discovery.action")}<ArrowRight size={14} aria-hidden="true" /></button>
      </div>
    </section>
  </div>;
}
