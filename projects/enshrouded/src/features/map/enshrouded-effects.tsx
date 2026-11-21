import { useGameText } from "../../i18n/game-text";
import { Clock3, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isDurationFact, isEffectFact, type EnshroudedFact } from "./enshrouded-effect-facts";

export default function EnshroudedEffects({ facts }: { facts: EnshroudedFact[] }) {
  const contentText = useGameText();
  const { t } = useTranslation();
  const effects = facts.filter(isEffectFact).flatMap((fact) => fact.value
    .replace(/([+-])\s+(?=\d)/g, "$1").split(/\s+(?=[+-]\d)/).map((part) => part.trim()).filter(Boolean));
  const duration = facts.find(isDurationFact)?.value;
  if (!effects.length && !duration) return null;

  return <section className="rounded-lg border border-accent/25 bg-accent-soft/30 p-3.5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
        <Sparkles size={14} aria-hidden="true" />{t("map.enshrouded.effects")}</h3>
      {contentText(duration && <div className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-surface/70 px-2 py-1 text-xs">
        <Clock3 size={13} className="text-zinc-400" aria-hidden="true" />
        <span className="text-zinc-400">{t("map.enshrouded.duration")}</span>
        <strong className="font-semibold tabular-nums text-zinc-100">{contentText(duration)}</strong>
      </div>)}
    </div>
    {effects.length > 0 && <div className={`mt-2.5 grid gap-1.5 ${effects.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
      {effects.map((effect, index) => {
        const match = effect.match(/^([+-]\d+(?:\.\d+)?%?)\s*(.*)$/);
        return <div key={`${effect}:${index}`} className="flex min-h-12 items-center gap-2 rounded-md border border-white/[0.07] bg-black/20 px-2.5 py-2">
          {match ? <><strong className="shrink-0 text-[14px] font-bold tabular-nums text-accent">{contentText(match[1])}</strong>
            <span className="text-[11px] leading-snug text-zinc-200">{contentText(match[2])}</span></>
            : <span className="text-[12px] leading-snug text-zinc-100">{contentText(effect)}</span>}
        </div>;
      })}
    </div>}
  </section>;
}
