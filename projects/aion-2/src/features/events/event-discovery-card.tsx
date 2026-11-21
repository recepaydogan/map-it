import { ArrowRight, MoonStar, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EVENTS_DISCOVERY_CAMPAIGN, GAME_CONFIG } from "../../game-config";
import { useOnboardingActive, shouldAutoStartOnboarding } from "../onboarding/use-onboarding";
import { useNewPageBadge } from "../onboarding/new-page-badges";
import { openEventGuide } from "./event-mission-navigation";
import { useEventMissions } from "./use-event-missions";

const DISMISSED_KEY = `${GAME_CONFIG.appName}:event-discovery-dismissed`;

const readDismissed = () => {
  try { return localStorage.getItem(DISMISSED_KEY) === EVENTS_DISCOVERY_CAMPAIGN; }
  catch (error) { console.warn("Could not read event discovery state", error); return false; }
};

export default function EventDiscoveryCard({ enabled, onHeightChange }: { enabled: boolean; onHeightChange: (height: number) => void }) {
  const { t } = useTranslation();
  const onboardingActive = useOnboardingActive();
  const eventsUnvisited = useNewPageBadge("events");
  const [dismissed, setDismissed] = useState(readDismissed);
  const [previewDismissed, setPreviewDismissed] = useState(false);
  const [now, setNow] = useState(Date.now);
  const cardRef = useRef<HTMLElement>(null);
  const preview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("previewEventDiscovery") === "1";
  const eligible = !preview && enabled && !onboardingActive && !shouldAutoStartOnboarding() && eventsUnvisited && !dismissed;
  const missions = useEventMissions(eligible);
  const visible = preview ? enabled && !previewDismissed : eligible && missions.status === "ready"
    && now >= Date.parse(`${missions.data.startDate}T00:00:00Z`)
    && now < Date.parse(`${missions.data.endDateExclusive}T00:00:00Z`);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!visible || !card) { onHeightChange(0); return; }
    const measure = () => onHeightChange(Math.ceil(card.getBoundingClientRect().height));
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    measure();
    return () => { observer.disconnect(); onHeightChange(0); };
  }, [onHeightChange, visible]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === DISMISSED_KEY) setDismissed(readDismissed());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!eligible || missions.status !== "ready") return;
    const { startDate, endDateExclusive } = missions.data;
    const nextBoundary = [Date.parse(`${startDate}T00:00:00Z`), Date.parse(`${endDateExclusive}T00:00:00Z`)]
      .find((boundary) => boundary > now);
    if (nextBoundary === undefined) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(nextBoundary - now, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [eligible, missions, now]);

  if (!visible) return null;

  const dismiss = () => {
    if (preview) { setPreviewDismissed(true); return; }
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, EVENTS_DISCOVERY_CAMPAIGN); }
    catch (error) { console.warn("Could not save event discovery state", error); }
  };

  return <section ref={cardRef} aria-labelledby="event-discovery-title" className="relative w-full overflow-hidden rounded-[var(--radius-lg)] border border-accent/45 bg-surface/95 p-4 shadow-xl shadow-black/40 backdrop-blur-xl">
    <div aria-hidden="true" className="pointer-events-none absolute -left-10 -top-14 size-36 rounded-full bg-accent/10 blur-2xl" />
    <div className="relative">
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent"><MoonStar size={14} aria-hidden="true" />{t("events.discovery.kicker")}</span>
        <button type="button" onClick={dismiss} aria-label={t("events.discovery.dismiss")} className="-mr-1 -mt-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-zinc-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-accent"><X size={15} aria-hidden="true" /></button>
      </div>
      <h2 id="event-discovery-title" className="mt-2 font-display text-lg font-semibold leading-tight text-white">{t("events.discovery.title")}</h2>
      <p className="mt-2 text-xs leading-5 text-zinc-200">{t("events.discovery.body")}</p>
      <button type="button" onClick={openEventGuide} className="mt-4 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] bg-accent px-3 text-xs font-semibold text-background transition-colors hover:bg-accent/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{t("events.discovery.action")}<ArrowRight size={14} aria-hidden="true" /></button>
    </div>
  </section>;
}
