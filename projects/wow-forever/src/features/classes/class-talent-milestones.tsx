import { useTranslation } from "react-i18next";
import SpellIcon from "../spells/spell-icon";
import SpellLink from "../spells/spell-link";
import { getSpellDescription } from "../spells/spell-description";
import { useLocalizedSpellText } from "../spells/spell-locales";
import { useSpellDetail } from "../spells/spell-data";
import type { ClassGuideBundle, ClassGuideSpec } from "./use-class-guide-bundle";

type Milestone = {
  name: string;
  target?: { id: number; iconId: number; level: number };
};

const talentLinkClass = "cursor-pointer text-left font-semibold text-zinc-100 hover:text-white hover:underline hover:decoration-white/50 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent";

const TalentName = ({ milestone }: { milestone: Milestone }) => milestone.target
  ? <SpellLink id={milestone.target.id} name={milestone.name} className={talentLinkClass} />
  : <span className="font-semibold text-zinc-100">{milestone.name}</span>;

const FeaturedTalent = ({ milestone }: { milestone: Milestone }) => {
  const { t } = useTranslation();
  const localizedSpellText = useLocalizedSpellText();
  const { detail } = useSpellDetail(milestone.target?.id ?? null);
  const translated = milestone.target ? localizedSpellText(milestone.target.id) : undefined;
  const description = getSpellDescription(translated?.d ?? detail?.d, translated?.a ?? detail?.a);
  const effect = t(`classGuide.full.keyTalentEffect.${milestone.name}`, { defaultValue: description });

  return <li className="flex min-w-[220px] flex-1 basis-[220px] gap-2.5 rounded-[var(--radius-sm)] border border-border bg-elevated/70 p-2.5">
    <SpellIcon id={milestone.target?.iconId} name={milestone.name} size={32} />
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-[12px] leading-4">
        <TalentName milestone={milestone} />
        {milestone.target?.level && <span className="shrink-0 text-[10px] tabular-nums text-zinc-400">{t("classes.level", { level: milestone.target.level })}</span>}
      </div>
      <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-zinc-300">{effect}</p>
    </div>
  </li>;
};

const CompactTalent = ({ milestone }: { milestone: Milestone }) => {
  const { t } = useTranslation();
  return <li className="flex min-w-0 items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-background/40 px-2 py-1.5 text-[11px] leading-4">
    <SpellIcon id={milestone.target?.iconId} name={milestone.name} size={22} />
    <span className="min-w-0 flex-1"><TalentName milestone={milestone} /></span>
    {milestone.target?.level && <span className="shrink-0 tabular-nums text-zinc-400">{t("classes.level", { level: milestone.target.level })}</span>}
  </li>;
};

const ClassTalentMilestones = ({ spec, bundle, level }: { spec: ClassGuideSpec; bundle: ClassGuideBundle; level: number }) => {
  const { t } = useTranslation();
  if (!spec.keyTalents?.length) return null;

  const milestones = spec.keyTalents.map((name) => ({ name, target: bundle.spellNames.get(name) }));
  const available = milestones.filter((entry) => !entry.target?.level || entry.target.level <= level);
  const later = milestones.filter((entry) => entry.target?.level && entry.target.level > level)
    .sort((a, b) => (a.target?.level ?? 0) - (b.target?.level ?? 0));

  return <section className="@container rounded-[var(--radius-md)] border border-border bg-surface p-4" aria-label={t("classGuide.full.keyTalents")}>
    <h3 className="font-display text-base font-semibold text-white">{t("classGuide.full.keyTalents")}</h3>
    <p className="mt-1 text-[11px] leading-4 text-zinc-400">{t("classGuide.full.keyTalentsDescription")}</p>
    <div className="mt-4">
      <h4 className="text-[11px] font-semibold text-zinc-200">{t("classGuide.full.availableBy", { level })}</h4>
      <ul className="mt-2 flex flex-wrap gap-2">{available.slice(0, 3).map((milestone) => <FeaturedTalent key={milestone.name} milestone={milestone} />)}</ul>
      {available.length > 3 && <div className="mt-3">
        <p className="mb-1.5 text-[10px] font-medium text-zinc-400">{t("classGuide.full.moreAvailable")}</p>
        <ul className="grid gap-1.5 @min-[550px]:grid-cols-2 @min-[800px]:grid-cols-3">{available.slice(3).map((milestone) => <CompactTalent key={milestone.name} milestone={milestone} />)}</ul>
      </div>}
      {later.length > 0 && <div className="mt-4 border-t border-border pt-3">
        <h4 className="text-[11px] font-semibold text-zinc-200">{t("classGuide.full.laterTalents")}</h4>
        <ul className="mt-2 grid gap-1.5 @min-[550px]:grid-cols-2 @min-[800px]:grid-cols-3">{later.map((milestone) => <CompactTalent key={milestone.name} milestone={milestone} />)}</ul>
      </div>}
    </div>
  </section>;
};

export default ClassTalentMilestones;
