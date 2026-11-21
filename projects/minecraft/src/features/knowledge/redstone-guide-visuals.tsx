import { ArrowRight, Power, Repeat2 } from "lucide-react";
import { useState } from "react";
import type { TFunction } from "i18next";
import { GAME_GUIDE_REDSTONE_SIGNAL_LINE } from "../../game-config.ts";
import { cn } from "../../lib/cn.ts";
import GuideItemLink from "./guide-item-link.tsx";
import { redstoneSignalAt } from "./redstone-guide-data.ts";
import type { RecipeSubjectDisplay } from "./recipe-subject-display.ts";

export const RedstoneComponentUse = ({ group, example, t }: { group: string; example: string; t: TFunction }) =>
  <div className="max-w-[760px] border-y border-border/70">
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-5 border-b border-border/70 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{t("inspector.redstoneGuide.role")}</span>
      <div className="min-w-0">
        <strong className="text-[12px] font-semibold text-accent">{t(`inspector.redstoneGuide.groups.${group}`)}</strong>
        <p className="mt-1 text-[12px] leading-[1.6] text-zinc-200">{t(`inspector.redstoneGuide.groupIntro.${group}`)}</p>
      </div>
    </div>
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-5 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{t("inspector.redstoneGuide.tryIt")}</span>
      <p className="min-w-0 text-[12px] leading-[1.6] text-zinc-100">{example}</p>
    </div>
  </div>;

export const RedstoneSignalDemo = ({ ids, display, t }: { ids: {
  source: string; wire: string; repeater: string; output: string;
}; display: RecipeSubjectDisplay; t: TFunction }) => {
  const [distance, setDistance] = useState(16);
  const [powered, setPowered] = useState(true);
  const [repeater, setRepeater] = useState(false);
  const strength = redstoneSignalAt(distance, powered, repeater);
  const lampLit = strength > 0;
  return <div className="max-w-[760px] rounded-[var(--radius-md)] border border-border bg-surface p-4">
    <p className="text-[12px] leading-[1.6] text-zinc-300">{t("inspector.redstoneGuide.lineIntro")}</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" aria-pressed={powered} onClick={() => setPowered(value => !value)}
        className={cn("flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          powered ? "border-accent/50 bg-accent-soft text-white" : "border-border bg-background text-zinc-300")}>
        <Power size={14} aria-hidden="true" />
        {t(powered ? "inspector.redstoneGuide.powerOn" : "inspector.redstoneGuide.powerOff")}
      </button>
      <button type="button" aria-pressed={repeater} onClick={() => setRepeater(value => !value)}
        className={cn("flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          repeater ? "border-accent/50 bg-accent-soft text-white" : "border-border bg-background text-zinc-300")}>
        <Repeat2 size={14} aria-hidden="true" />
        {t("inspector.redstoneGuide.repeaterAt", { count: GAME_GUIDE_REDSTONE_SIGNAL_LINE.repeaterAfter })}
      </button>
    </div>
    <div className="mt-5 flex items-baseline justify-between gap-3">
      <label htmlFor="redstone-signal-distance" className="text-[12px] font-medium text-zinc-100">
        {t("inspector.redstoneGuide.distance")}
      </label>
      <strong className="text-[13px] tabular-nums text-accent">
        {t("inspector.redstoneGuide.blocks", { count: distance })}
      </strong>
    </div>
    <input id="redstone-signal-distance" type="range" min={1} max={GAME_GUIDE_REDSTONE_SIGNAL_LINE.maxDistance}
      value={distance} onChange={event => setDistance(Number(event.target.value))}
      className="mt-2 w-full cursor-pointer accent-[var(--color-accent)]" />
    <div className="mt-4 grid grid-cols-[135px_minmax(0,1fr)_135px] gap-3 rounded-[var(--radius-sm)] border border-border/70 bg-black/20 p-3">
      <div className="min-w-0 border-r border-border/70 pr-2">
        <GuideItemLink id={ids.source} display={display} />
        <p className={cn("mt-2 text-[11px] font-semibold", powered ? "text-accent" : "text-subtle")}>
          {t(powered ? "inspector.redstoneGuide.powerOn" : "inspector.redstoneGuide.powerOff")}
        </p>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5"><ArrowRight size={13} className="shrink-0 text-muted" aria-hidden="true" />
          <GuideItemLink id={ids.wire} display={display} />
        </div>
        <div className="mt-3 grid gap-0.5" style={{ gridTemplateColumns: `repeat(${distance},minmax(0,1fr))` }} aria-hidden="true">
          {Array.from({ length: distance }, (_, index) => <span key={index}
            className={cn("h-3 rounded-[2px]", redstoneSignalAt(index + 1, powered, repeater)
              ? "bg-accent" : "bg-white/10", repeater && index === 14 && "ring-1 ring-white/70")}
            style={redstoneSignalAt(index + 1, powered, repeater)
              ? { opacity: 0.45 + redstoneSignalAt(index + 1, powered, repeater) / 30 } : undefined} />)}
        </div>
        {repeater && <div className="mt-2"><GuideItemLink id={ids.repeater} display={display} /></div>}
      </div>
      <div className="min-w-0 border-l border-border/70 pl-2">
        <GuideItemLink id={ids.output} display={display} />
        <p className={cn("mt-2 text-[11px] font-semibold", lampLit ? "text-accent" : "text-subtle")}
          aria-live="polite">{t(lampLit ? "inspector.redstoneGuide.lampLit" : "inspector.redstoneGuide.lampDark")}</p>
      </div>
    </div>
    <div className="mt-3 flex items-baseline justify-between border-t border-border/70 pt-3">
      <span className="text-[11px] text-subtle">{t("inspector.redstoneGuide.signalStrength")}</span>
      <strong className="text-[15px] font-semibold tabular-nums text-white" aria-live="polite">{strength} / 15</strong>
    </div>
    <p className="mt-2 text-[11px] leading-5 text-subtle">{t("inspector.redstoneGuide.rangeNote")}</p>
  </div>;
};

export const RedstoneRelatedParts = ({ ids, display }: { ids: readonly string[]; display: RecipeSubjectDisplay }) =>
  <div className="grid max-w-[760px] grid-cols-2 gap-x-5">
    {ids.map(id => <div key={id} className="min-w-0 border-b border-border/70 py-2">
      <GuideItemLink id={id} display={display} />
    </div>)}
  </div>;
