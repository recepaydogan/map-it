import { ArrowRight, CalendarDays, Coins } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import EventCandyGuide from "./event-candy-guide";
import EventGuideItemLink from "./event-guide-item-link";
import type { EventGuideTarget } from "./event-mission-navigation";
import type { EventMapTarget } from "./event-schedule";
import { useEventGuide, type EventGuideCatalog } from "./use-event-guide";

type CosmeticGroup = keyof EventGuideCatalog["cosmetics"];
const cosmeticGroups: CosmeticGroup[] = ["sets", "weapons", "pets", "wings", "accessories"];
const SectionTitle = ({ title, subtitle }: {
  title: string; subtitle?: string;
}) => <div className="mb-4">
  <h3 className="text-base font-semibold text-white">{title}</h3>
  {subtitle && <p className="mt-1 text-xs leading-5 text-zinc-300">{subtitle}</p>}
</div>;

export default function EventGuidePanel({ onShowMap, onShowMissions, scrollTarget, onScrollComplete }: {
  onShowMap: (target: EventMapTarget) => void;
  onShowMissions: () => void;
  scrollTarget: EventGuideTarget | null;
  onScrollComplete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const state = useEventGuide();
  const [cosmeticGroup, setCosmeticGroup] = useState<CosmeticGroup>("sets");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const looksSectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (scrollTarget !== "looks" || state.status !== "ready") return;
    const container = scrollContainerRef.current;
    const section = looksSectionRef.current;
    if (!container || !section) return;
    const top = container.scrollTop + section.getBoundingClientRect().top - container.getBoundingClientRect().top - 12;
    container.scrollTo({
      top: Math.max(0, top),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
    onScrollComplete();
  }, [scrollTarget, state.status, onScrollComplete]);
  if (state.status !== "ready") return <p role={state.status === "error" ? "alert" : "status"} className="p-8 text-sm text-subtle">{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;

  const guide = state.data;
  const coinTotal = guide.attendance.dailyCoins.reduce((sum, coins) => sum + coins, 0);
  const formatDate = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString(i18n.language, { month: "long", day: "numeric", timeZone: "UTC" });

  return <div ref={scrollContainerRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 py-5 @min-[720px]:px-8 @min-[720px]:py-7">
    <div className="mx-auto max-w-[1120px] space-y-5">
      <header className="rounded-[var(--radius-lg)] border border-accent/35 px-5 py-5 @min-[720px]:px-7 @min-[720px]:py-6">
        <div className="flex flex-col gap-5 @min-[720px]:flex-row @min-[720px]:items-start @min-[720px]:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{t("events.guide.kicker")}</p>
            <h2 className="mt-2 font-display text-[25px] font-semibold leading-tight text-white @min-[720px]:text-[31px]">{t("events.guide.title")}</h2>
            <p className="mt-2 max-w-[740px] text-[13px] leading-6 text-zinc-200">{t("events.guide.intro")}</p>
            <p className="mt-4 inline-flex items-center gap-2 text-xs text-zinc-300"><CalendarDays size={14} className="text-accent" aria-hidden="true" />{t("events.guide.halloweenUntil", { date: formatDate(guide.endDateExclusive) })}</p>
          </div>
          <button type="button" onClick={onShowMissions} className="inline-flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-[var(--radius-sm)] border border-accent/50 px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:border-accent hover:bg-accent-soft hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
            {t("events.guide.views.missions")}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="rounded-[var(--radius-lg)] border border-border p-5 @min-[720px]:p-6">
        <SectionTitle title={t("events.guide.attendanceTitle")} subtitle={t("events.guide.attendanceIntro")} />
        <div className="grid grid-cols-7 gap-1.5 @min-[600px]:gap-2" aria-label={t("events.guide.attendanceTitle")}>
          {guide.attendance.dailyCoins.map((coins, index) => <div key={index} className={cn("rounded-[var(--radius-sm)] border px-1 py-2 text-center", coins > 35 ? "border-accent/50 bg-accent-soft" : "border-border")}
            aria-label={t("events.guide.attendanceDayLabel", { day: index + 1, coins })}>
            <span className="block text-[10px] text-zinc-300">{t("events.guide.day", { day: index + 1 })}</span>
            <strong className="mt-1 block text-sm tabular-nums text-accent">{coins}</strong>
          </div>)}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div><p className="mb-2 text-xs text-zinc-300">{t("events.guide.attendanceWhere")}</p><EventGuideItemLink id={guide.attendance.coinItemId} guide={guide} compact /></div>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent"><Coins size={16} aria-hidden="true" />{t("events.guide.attendanceTotal", { count: coinTotal })}</span>
        </div>
      </section>

      <section className="rounded-[var(--radius-lg)] border border-border p-5 @min-[720px]:p-6">
        <SectionTitle title={t("events.guide.candyTitle")} subtitle={t("events.guide.candyIntro")} />
        <EventCandyGuide guide={guide} onShowMap={onShowMap} />
      </section>

      <section ref={looksSectionRef} className="rounded-[var(--radius-lg)] border border-border p-5 @min-[720px]:p-6">
        <SectionTitle title={t("events.guide.cosmeticsTitle")} subtitle={t("events.guide.cosmeticsIntro")} />
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label={t("events.guide.cosmeticsGroupsLabel")}>
          {cosmeticGroups.map((group) => <button key={group} type="button" onClick={() => setCosmeticGroup(group)} aria-pressed={cosmeticGroup === group}
            className={cn("cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-accent", cosmeticGroup === group ? "border-accent/60 bg-accent-soft text-white" : "border-border text-zinc-300 hover:text-white")}>{t(`events.guide.cosmeticGroups.${group}`)}</button>)}
        </div>
        {cosmeticGroup === "pets" && <p className="mb-3 text-xs leading-5 text-zinc-300">{t("events.guide.petUnlockNote")}</p>}
        {cosmeticGroup === "wings" && <p className="mb-3 text-xs leading-5 text-zinc-300">{t("events.guide.wingUnlockNote")}</p>}
        <div className="grid gap-2 @min-[570px]:grid-cols-2 @min-[940px]:grid-cols-3">{guide.cosmetics[cosmeticGroup].map((id) => <EventGuideItemLink key={id} id={id} guide={guide} />)}</div>
        <p className="mt-4 text-xs text-zinc-400">{t("events.guide.cosmeticsUntil", { date: formatDate(guide.cosmeticsEndDateExclusive) })}</p>
      </section>
    </div>
  </div>;
}
