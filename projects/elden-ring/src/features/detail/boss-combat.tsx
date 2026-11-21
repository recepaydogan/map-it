import { ArrowDown, ArrowRight, ArrowUp, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  type Combat,
  colorFor,
  combatHeadline,
  dmgTag,
  isResist,
  isWeak,
} from "../../data/combat";
import { cn } from "../../lib/cn";
import { useBuildCta } from "./use-build-cta";

/** A type chip tinted with that type's own colour. */
const TypeChip = ({ type, tag, dir }: { type: string; tag?: string; dir?: "up" | "down" }) => {
  const { t } = useTranslation();
  const c = colorFor(type);
  return (
    <span
      className="flex items-center gap-1 rounded-[var(--radius-full)] px-2 py-0.5 text-[12px] font-medium"
      style={{ color: c, backgroundColor: `${c}1f`, boxShadow: `inset 0 0 0 1px ${c}33` }}
    >
      {dir === "up" && <ArrowUp size={11} aria-hidden="true" />}
      {dir === "down" && <ArrowDown size={11} aria-hidden="true" />}
      {t(`combatType.${type}`, { defaultValue: type })}
      {tag && <span className="tabular-nums opacity-80">{tag}</span>}
    </span>
  );
};

/**
 * Compact combat intel for the cramped panel: a plain-English headline (the single
 * best approach) plus the few most relevant chips. "See full combat tips" opens the
 * whole breakdown. Everything is the real NpcParam table, never wiki tactics.
 *
 * `hasBuild` is what the full page will actually open on: without it the button
 * must not promise a build (nor spend the one-shot CTA glow advertising one).
 */
const BossCombat = ({
  combat,
  hasBuild,
  onExpand,
}: {
  combat: Combat;
  hasBuild: boolean;
  onExpand: () => void;
}) => {
  const { t } = useTranslation();
  const pending = useBuildCta((s) => s.pending) && hasBuild;
  const markUsed = useBuildCta((s) => s.markUsed);
  const weaknesses = combat.damage.filter((d) => isWeak(d.mult));
  // Lead with weaknesses; if it has none, the least-resisted hits are the best bet.
  const targets = weaknesses.length ? weaknesses.slice(0, 3) : combat.damage.slice(0, 2);
  const bestStatus = combat.status.find((s) => s.tier === "effective" || s.tier === "moderate");

  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-zinc-300">{combatHeadline(combat, t)}</p>

      <div className="flex flex-wrap gap-1.5">
        {targets.map((d) => (
          <TypeChip
            key={d.type}
            type={d.type}
            tag={dmgTag(d.mult)}
            dir={isWeak(d.mult) ? "up" : isResist(d.mult) ? "down" : undefined}
          />
        ))}
        {bestStatus && <TypeChip type={bestStatus.type} />}
      </div>

      {/* Lit up until the player has opened a build once — see use-build-cta. */}
      <button
        onClick={() => {
          if (hasBuild) markUsed();
          onExpand();
        }}
        className={cn(
          "flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-2 text-[12px] font-medium transition-colors cursor-pointer",
          pending
            ? "animate-cta-glow border-accent/60 bg-accent/[0.14] text-accent hover:bg-accent/20 motion-reduce:animate-none"
            : "border-border bg-white/[0.03] text-zinc-300 hover:border-accent/50 hover:bg-white/[0.06] hover:text-white",
        )}
      >
        {pending && <Sparkles size={13} aria-hidden="true" />}
        {t(hasBuild ? "detail.openBossBuild" : "detail.seeFullCombatTips")}
        <ArrowRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
};

export default BossCombat;
