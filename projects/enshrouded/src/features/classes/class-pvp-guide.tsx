import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import InlineAbilityLinks from "../../components/inline-ability-links";
import ClassBuildGuideSections from "./class-build-guide-sections";
import ClassGuideGearSection from "./class-guide-gear-section";
import type { ClassGuideBundle, ClassGuideSpec } from "./use-class-guide-bundle";

type Links = { id: number; name: string; description: string }[];

const ClassPvpGuide = ({ spec, bundle, links, level }: {
  spec: ClassGuideSpec; bundle: ClassGuideBundle; links: Links; level: number;
}) => {
  const { t } = useTranslation();
  const guide = bundle.play.specs[spec.tree]?.pvp;
  const builds = bundle.builds.specs[spec.tree]?.builds.filter((item) => item.purpose === "pvp") ?? [];
  const levels = [...new Set(builds.map((item) => item.level))].sort((a, b) => a - b);
  const [buildLevel, setBuildLevel] = useState(levels.includes(level) ? level : levels[0]);
  if (!guide) return null;

  const build = builds.find((item) => item.level === buildLevel) ?? builds[0];
  const selectedLevel = build?.level ?? level;
  const phases = [
    { title: t("classGuide.full.burst"), steps: guide.burst },
    { title: t("classGuide.full.control"), steps: guide.control },
    { title: t("classGuide.full.defensive"), steps: guide.defensive },
  ];
  const linked = (text: string) => <InlineAbilityLinks text={text} abilities={links} />;

  return <div className="space-y-5">
    <ClassBuildGuideSections build={build} builds={builds} bundle={bundle} links={links} phases={phases}
      mode="pvp" level={selectedLevel} hideLocked onSelect={(item) => setBuildLevel(item.level)}
      gear={<ClassGuideGearSection classId={bundle.classId} tree={spec.tree} mode="pvp" cap={bundle.gameBuild.cap} level={selectedLevel} />} />

    {guide.stats?.order?.length ? <section className="@container rounded-[var(--radius-md)] border border-border bg-surface p-4"><h3 className="text-[13px] font-semibold text-white">{t("classGuide.full.statPriority")}</h3><ol className="mt-3 columns-2 gap-x-4 @min-[700px]:columns-3">{guide.stats.order.map((name, index) => <li key={`${name}-${index}`} className="flex break-inside-avoid gap-2 border-t border-border py-2 text-[12px] text-zinc-200"><span className="w-4 shrink-0 tabular-nums text-subtle">{index + 1}</span>{name}</li>)}</ol>{(guide.stats.why || guide.weights) && <details className="group mt-2 border-t border-border pt-2"><summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-[11px] font-medium text-zinc-300 marker:hidden hover:text-white">{t("classGuide.full.statWeights")}<ChevronDown size={13} className="transition-transform group-open:rotate-180" aria-hidden="true" /></summary><div className="mt-2 space-y-2 text-[12px] leading-5 text-zinc-300">{guide.stats.why && <p>{linked(guide.stats.why)}</p>}{guide.weights && <div className="flex flex-wrap gap-1.5">{Object.entries(guide.weights).sort((a, b) => b[1] - a[1]).map(([key, value]) => <span key={key} className="rounded-[var(--radius-sm)] border border-border px-2 py-1 text-[11px]"><b className="mr-1 text-white">{value}</b>{bundle.stats[key] ?? key}</span>)}</div>}</div></details>}</section> : null}

    {(guide.tips?.length || guide.battlegrounds || guide.world) && <section className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
      <h3 className="text-[13px] font-semibold text-white">{t("classGuide.full.pvpSituations")}</h3>
      <div className="mt-3 grid items-start gap-4 @min-[700px]:grid-cols-2">
        {guide.tips?.length ? <div><h4 className="text-[12px] font-semibold text-zinc-100">{t("classGuide.full.tips")}</h4><ul className="mt-2 list-disc space-y-1.5 pl-4 text-[12px] leading-5 text-zinc-300">{guide.tips.map((tip, index) => <li key={index}>{linked(tip)}</li>)}</ul></div> : null}
        {guide.battlegrounds && <div><h4 className="text-[12px] font-semibold text-zinc-100">{t("classGuide.full.battlegrounds")}</h4><p className="mt-2 text-[12px] leading-5 text-zinc-300">{linked(guide.battlegrounds)}</p></div>}
        {guide.world && <div><h4 className="text-[12px] font-semibold text-zinc-100">{t("classGuide.full.worldPvp")}</h4><p className="mt-2 text-[12px] leading-5 text-zinc-300">{linked(guide.world)}</p></div>}
      </div>
    </section>}

    {guide.matchups?.length ? <details className="group rounded-[var(--radius-md)] border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[13px] font-semibold text-white marker:hidden focus-visible:outline-2 focus-visible:outline-accent">{t("classGuide.full.matchups")}<ChevronDown size={14} className="text-subtle transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
      <dl className="grid items-start gap-x-6 border-t border-border px-4 py-2 @min-[700px]:grid-cols-2">{guide.matchups.map((matchup) => <div key={matchup.vs} className="border-b border-border py-2.5"><dt className="text-[12px] font-semibold text-zinc-100">{matchup.vs}</dt><dd className="mt-1 text-[12px] leading-5 text-zinc-300">{linked(matchup.note)}</dd></div>)}</dl>
    </details> : null}
    {selectedLevel >= 30 && guide.at30 && <section className="rounded-[var(--radius-md)] border border-border bg-surface p-4"><h3 className="text-[13px] font-semibold text-white">{t("classGuide.full.atLevel30")}</h3><div className="mt-2 space-y-3 text-[12px] leading-5 text-zinc-300"><p>{linked(guide.at30.notes)}</p>{guide.at30.adds?.map((step, index) => <p key={index}><strong className="text-white">{step.spell ?? step.ability}:</strong>{" "}{linked(step.note)}</p>)}</div></section>}
  </div>;
};

export default ClassPvpGuide;
