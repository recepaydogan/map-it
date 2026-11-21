import { Sparkles, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type ErEffect, erItemExtra } from "../../data/er-codex-extras";
import { localizeErMapText } from "../../data/er-map-text";
import type { ErItem } from "../../data/er-items-data";
import { erItemKey } from "../../data/er-items-data";
import { cn } from "../../lib/cn";

/** Section heading with a short accent tick — matches ErItemDetail's own voice. */
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h4 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
    <span className="h-px w-3 bg-accent/60" aria-hidden="true" />
    {children}
  </h4>
);

/**
 * The numbers behind the prose. Every row is one SpEffect field, decoded — and the ones
 * that HURT you are coloured as such, which is the whole point: a talisman's description
 * will happily tell you it "raises attributes" and stay quiet about the 10% extra damage.
 */
const EffectRow = ({ e }: { e: ErEffect }) => {
  const { t } = useTranslation();
  return (
  <div className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-white/[0.03] px-2.5 py-1.5">
    <span className="min-w-0 truncate text-[12.5px] text-zinc-300">{t(`fx.${e.label}`, { defaultValue: e.label })}</span>
    <span
      className={cn(
        "shrink-0 text-[12.5px] font-semibold tabular-nums",
        e.kind === "debuff" ? "text-amber-300" : "text-emerald-300",
      )}
    >
      {e.value}
    </span>
  </div>
  );
};

/**
 * The skill an item carries, with its real FP cost and the game's own description
 * of it — weapons have a default one, Ashes of War ARE one.
 *
 * Rendered directly under the description on both item surfaces, ahead of how-to-get
 * and the stat tables: the skill is what the item DOES, and on an Ash of War it is
 * the entire item, so making it the first section is the difference between reading
 * the page and scrolling it.
 *
 * From SwordArtsParam — a param the item builder never read.
 */
export const ErItemSkill = ({ item }: { item: ErItem }) => {
  const { t } = useTranslation();
  const skill = erItemExtra(erItemKey(item))?.skill;

  if (!skill) return null;

  return (
    <div>
      <SectionTitle>
        <Zap size={12} className="text-accent" aria-hidden="true" />
        {t("codex.section.skill")}
      </SectionTitle>
      <div className="rounded-[var(--radius-lg)] border border-border bg-white/[0.02] p-3.5">
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="text-[15px] font-semibold text-white">{localizeErMapText(skill.name)}</span>
          {skill.fp ? (
            <span className="rounded-[var(--radius-full)] bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-300">
              {t("codex.fpCost", { fp: skill.fp })}
            </span>
          ) : null}
          {skill.fpFollowUp?.map((fp, i) => (
            <span
              key={i}
              className="rounded-[var(--radius-full)] bg-white/8 px-2 py-0.5 text-[11px] font-medium text-zinc-300"
            >
              {t("codex.fpFollowUp", { fp })}
            </span>
          ))}
        </p>
        {skill.caption && (
          <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-zinc-400">
            {localizeErMapText(skill.caption)}
          </p>
        )}
      </div>
    </div>
  );
};

/**
 * The numbers behind the prose: the decoded SpEffect breakdown of what the item
 * actually does to you, and how long it lasts.
 *
 * Sits below the stat tables — unlike the skill, this is the detail you go looking
 * for once you already know what the item is. From SpEffectParam.
 */
export const ErItemEffects = ({ item }: { item: ErItem }) => {
  const { t } = useTranslation();
  const extra = erItemExtra(erItemKey(item));

  if (!extra?.effects?.length) return null;

  const duration = extra.durationSec;

  return (
    <div>
      <SectionTitle>
        <Sparkles size={12} className="text-accent" aria-hidden="true" />
        {t("codex.section.effect")}
        {duration ? (
          <span className="font-normal normal-case tracking-normal text-zinc-500">
            {" · "}
            {t("codex.effectDuration", { sec: duration })}
          </span>
        ) : null}
      </SectionTitle>
      <div className="flex flex-col gap-1.5">
        {extra.effects.map((e) => (
          <EffectRow key={`${e.label}-${e.value}`} e={e} />
        ))}
      </div>
      {extra.tickSec ? (
        <p className="mt-1.5 text-[11.5px] text-subtle">
          {t("codex.effectTick", { sec: extra.tickSec })}
        </p>
      ) : null}
    </div>
  );
};
