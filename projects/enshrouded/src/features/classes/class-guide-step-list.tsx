import { useTranslation } from "react-i18next";
import InlineAbilityLinks from "../../components/inline-ability-links";
import SpellIcon from "../spells/spell-icon";
import SpellLink from "../spells/spell-link";
import type { ClassGuideBundle, GuideStep } from "./use-class-guide-bundle";

type Links = { id: number; name: string; description: string }[];

const ClassGuideStepList = ({ title, steps, bundle, links, level, hideLocked }: {
  title: string; steps?: GuideStep[]; bundle: ClassGuideBundle; links: Links; level: number; hideLocked?: boolean;
}) => {
  const { t } = useTranslation();
  const visible = steps?.filter((step) => {
    const unlock = bundle.spellNames.get(step.spell ?? step.ability ?? "")?.level;
    return !hideLocked || !unlock || unlock <= level;
  }) ?? [];
  if (!visible.length) return null;

  return <section aria-label={title} className="@container min-w-0 rounded-[var(--radius-md)] border border-border bg-surface p-4">
    <h4 className="font-display text-[14px] font-semibold text-white">{title}</h4>
    <ol className="mt-2 gap-x-5 @min-[700px]:columns-2">{visible.map((step, index) => {
      const name = step.spell ?? step.ability ?? "";
      const target = bundle.spellNames.get(name);
      return <li key={`${name}-${index}`} className="flex min-w-0 break-inside-avoid items-start gap-2.5 border-t border-border py-2.5">
        <span className="w-4 shrink-0 pt-1 text-right text-[11px] font-semibold tabular-nums text-subtle">{index + 1}</span>
        <SpellIcon id={target?.iconId} name={name} size={26} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold">{target ? <SpellLink id={target.id} name={name} /> : <span className="text-zinc-100">{name}</span>}{target?.level && target.level > level && <span className="text-[11px] font-normal text-zinc-300">{t("classes.level", { level: target.level })}+</span>}</div>
          <p className="mt-1 text-[13px] leading-5 text-zinc-200"><InlineAbilityLinks text={step.note} abilities={links} /></p>
        </div>
      </li>;
    })}</ol>
  </section>;
};

export default ClassGuideStepList;
