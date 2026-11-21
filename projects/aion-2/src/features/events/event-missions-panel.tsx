import { ArrowLeft, ArrowRight, CalendarDays, MapPin, RotateCcw, ScrollText } from "lucide-react";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { EVENT_MISSION_OBJECTIVE_LINKS } from "../../game-config";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import { getItemDisplayName } from "../../lib/item-display-name";
import ItemIcon from "../database/item-icon";
import { openReference } from "../reference/reference-navigation";
import type { EventGuideTarget } from "./event-mission-navigation";
import type { EventMapTarget } from "./event-schedule";
import { useEventMissions } from "./use-event-missions";
import EventGuidePanel from "./event-guide-panel";

const displayTitle = (title: string) => title.replace(/^\[Event\]\s*/u, "");
const missionCopyKey = (id: string, field: "title" | "objective") => `events.missions.entries.${id}.${field}`;

export default function EventMissionsPanel({ onShowMap, view, onChangeView, guideScrollTarget, onGuideScrollComplete }: {
  onShowMap: (target: EventMapTarget) => void;
  view: "guide" | "missions";
  onChangeView: (view: "guide" | "missions") => void;
  guideScrollTarget: EventGuideTarget | null;
  onGuideScrollComplete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const state = useEventMissions();
  const [selectedId, setSelectedId] = useState<string>();
  const [showDetail, setShowDetail] = useState(false);
  if (view === "guide") return <EventGuidePanel onShowMap={onShowMap} onShowMissions={() => onChangeView("missions")}
    scrollTarget={guideScrollTarget} onScrollComplete={onGuideScrollComplete} />;
  if (state.status !== "ready") return <p role={state.status === "error" ? "alert" : "status"} className="p-8 text-sm text-subtle">{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;

  const { missions, reward, merchantLocations, endDateExclusive } = state.data;
  const selected = missions.find((mission) => mission.id === selectedId) ?? missions[0];
  const total = missions.reduce((sum, mission) => sum + mission.rewardAmount, 0);
  const endDate = new Date(`${endDateExclusive}T00:00:00Z`).toLocaleDateString(i18n.language, { month: "long", day: "numeric", timeZone: "UTC" });
  const gameRewardName = gameText(reward.name, reward.itemId);
  const rewardName = getItemDisplayName(reward.name, gameRewardName === reward.name ? t("events.missions.rewardName") : gameRewardName);
  const expired = new Date() >= new Date(`${endDateExclusive}T00:00:00Z`);
  const objectiveLink = selected ? EVENT_MISSION_OBJECTIVE_LINKS[selected.id] : undefined;

  return <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 py-5 @min-[720px]:px-8 @min-[720px]:py-7">
    <div className="mx-auto max-w-[1120px] space-y-6">
      <section className="rounded-[var(--radius-lg)] border border-accent/30 px-5 py-5 @min-[720px]:px-7 @min-[720px]:py-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-[620px]">
            <button type="button" onClick={() => onChangeView("guide")} className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-accent underline decoration-accent/60 underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-accent"><ArrowLeft size={14} aria-hidden="true" />{t("events.guide.views.guide")}</button>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{t("events.missions.kicker")}</p>
            <h2 className="font-display text-[25px] font-semibold leading-tight text-white @min-[720px]:text-[31px]">{t("events.missions.title")}</h2>
            <p className="mt-2 max-w-[560px] text-[13px] leading-6 text-zinc-200">{t("events.missions.intro")}<span className="block">{t("events.missions.spendIntroLine")}</span></p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-200">
              <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} className="text-accent" aria-hidden="true" />{t(expired ? "events.missions.ended" : "events.missions.until", { date: endDate })}</span>
              <span className="inline-flex items-center gap-1.5"><RotateCcw size={14} className="text-accent" aria-hidden="true" />{t("events.missions.weeklyReset")}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded-[var(--radius-md)] border border-accent/30 px-4 py-3">
            <ItemIcon icon={reward.icon} name={rewardName} size={36} />
            <span><span className="block text-[11px] text-zinc-300">{t("events.missions.weeklyTotal")}</span><strong className="text-lg tabular-nums text-accent">{total}</strong></span>
          </div>
        </div>
      </section>

      <div className="grid min-h-[480px] gap-5 @min-[870px]:grid-cols-[minmax(320px,0.88fr)_minmax(0,1.12fr)]">
        <section className={cn("min-w-0", showDetail && "hidden @min-[870px]:block")} aria-label={t("events.missions.listLabel")}>
          <div className="mb-3 flex items-end justify-between gap-3 px-1">
            <h3 className="text-base font-semibold text-white">{t("events.missions.listTitle")}</h3>
            <span className="text-xs tabular-nums text-zinc-300">{t("events.missions.count", { count: missions.length })}</span>
          </div>
          <div className="space-y-2">{missions.map((mission, index) => <button key={mission.id} type="button" onClick={() => { setSelectedId(mission.id); setShowDetail(true); }} aria-current={selected?.id === mission.id ? "true" : undefined}
            className={cn("group flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border px-3.5 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent", selected?.id === mission.id ? "border-accent/60" : "border-border hover:border-accent/40")}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-border text-[11px] font-semibold tabular-nums text-accent">{String(index + 1).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold leading-5 text-white">{t(missionCopyKey(mission.id, "title"), { defaultValue: displayTitle(mission.title) })}</span><span className="mt-0.5 block text-[11px] leading-4 text-zinc-300"><Trans i18nKey={missionCopyKey(mission.id, "objective")} defaults={mission.objective} components={{ target: <span /> }} /></span></span>
            <span className="shrink-0 text-right"><span className="block text-[13px] font-semibold tabular-nums text-accent">+{mission.rewardAmount}</span><span className="block text-[10px] text-zinc-300">{t("events.missions.coins")}</span></span>
            <ArrowRight size={14} className="hidden shrink-0 text-accent @min-[540px]:block" aria-hidden="true" />
          </button>)}</div>
        </section>

        {selected && <section className={cn("min-w-0", !showDetail && "hidden @min-[870px]:block")} aria-label={t("events.missions.detailLabel")}>
          <div className="rounded-[var(--radius-lg)] border border-border p-5 @min-[720px]:p-6">
            <button type="button" onClick={() => setShowDetail(false)} className="mb-5 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-accent focus-visible:outline-2 focus-visible:outline-accent @min-[870px]:hidden"><ArrowLeft size={14} aria-hidden="true" />{t("events.missions.backToList")}</button>
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/30"><ScrollText size={21} className="text-accent" aria-hidden="true" /></div>
              <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{t("events.missions.detailKicker")}</p><h3 className="mt-1 font-display text-xl font-semibold text-white">{t(missionCopyKey(selected.id, "title"), { defaultValue: displayTitle(selected.title) })}</h3></div>
            </div>
            <div className="mt-6 border-t border-border pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300">{t("events.missions.objective")}</p>
              <p className="mt-2 text-base font-medium leading-7 text-white"><Trans i18nKey={missionCopyKey(selected.id, "objective")} defaults={selected.objective}
                components={{ target: objectiveLink ? <button type="button" onClick={() => openReference({ category: objectiveLink.category, id: objectiveLink.id, name: objectiveLink.text })} className="cursor-pointer text-accent underline decoration-accent underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-accent" /> : <span /> }} /></p>
            </div>
            <div className="mt-6 border-t border-border pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300">{t("events.missions.reward")}</p>
              <button type="button" onClick={() => openReference({ category: "items", id: reward.itemId, name: reward.name })} className="mt-3 flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border p-3 text-left hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent">
                <ItemIcon icon={reward.icon} name={rewardName} size={40} /><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-white">{rewardName}</span><span className="mt-0.5 block text-xs text-zinc-300">{t("events.missions.rewardSource")}</span></span><strong className="text-lg tabular-nums text-accent">×{selected.rewardAmount}</strong><ArrowRight size={15} className="text-accent" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-6 border-t border-border pt-5" aria-labelledby="event-mission-traders-title">
              <h4 id="event-mission-traders-title" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300">{t("events.missions.spendTitle")}</h4>
              <p className="mt-1.5 text-xs leading-5 text-zinc-300">{t("events.missions.spendIntro")}</p>
              <div className="mt-3 grid gap-2 @min-[650px]:grid-cols-2">{merchantLocations.map((location) => <button key={location.markerId} type="button" onClick={() => onShowMap(location)} className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border border-border px-3 py-2.5 text-left hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent">
                <MapPin size={16} className="shrink-0 text-accent" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-[12px] font-medium text-white">{gameText(location.region)}</span><span className="block text-[11px] text-zinc-300">{t(`reference.adventure.factions.${location.faction}`)}</span></span><ArrowRight size={14} className="shrink-0 text-accent" aria-hidden="true" />
              </button>)}</div>
            </div>
            <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-zinc-300">{t("events.missions.resetDetail")}</p>
          </div>
        </section>}
      </div>
    </div>
  </div>;
}
