import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import InlineAbilityLinks from "../../components/inline-ability-links";
import ForeverLabel from "../../components/forever-label";
import ClassBuildGuideSections from "./class-build-guide-sections";
import ClassGuideStepList from "./class-guide-step-list";
import ClassGuideGearSection from "./class-guide-gear-section";
import ClassPvpGuide from "./class-pvp-guide";
import ClassTalentMilestones from "./class-talent-milestones";
import type { ClassGuideBundle, ClassGuideSpec } from "./use-class-guide-bundle";

type Links = { id: number; name: string; description: string; icon?: string }[];

const LinkedText = ({ text, links }: { text: string; links: Links }) => <InlineAbilityLinks text={text} abilities={links} />;

const StatPriority = ({ order, why, weights, stats, links }: {
  order?: string[]; why?: string; weights?: Record<string, number>; stats: Record<string, string>; links: Links;
}) => {
  const { t } = useTranslation();
  if (!order?.length && !weights) return null;
  return <section className="@container rounded-[var(--radius-md)] border border-border bg-surface p-4"><h3 className="text-[13px] font-semibold text-white">{t("classGuide.full.statPriority")}</h3>
    {order?.length ? <ol className="mt-3 columns-2 gap-x-4 @min-[550px]:columns-3">{order.map((label, index) => <li key={`${label}-${index}`} className="flex min-w-0 break-inside-avoid items-baseline gap-2 border-t border-border py-2 text-[12px] leading-5 text-zinc-200"><span className="w-4 shrink-0 font-semibold tabular-nums text-subtle">{index + 1}</span><span>{label}</span></li>)}</ol> : null}
    {why && <p className="mt-3 text-[12px] leading-6 text-zinc-300"><LinkedText text={why} links={links} /></p>}
    {weights && Object.keys(weights).length > 0 && <details className="group mt-3 border-t border-border pt-3"><summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-zinc-200 marker:hidden hover:text-white">{t("classGuide.full.statWeights")}<ChevronDown size={12} className="transition-transform group-open:rotate-180" aria-hidden="true" /></summary><div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(weights).sort((a, b) => b[1] - a[1]).map(([key, value]) => <span key={key} className="rounded-[var(--radius-sm)] border border-border bg-elevated px-2 py-1 text-[11px] text-zinc-300"><b className="mr-1.5 tabular-nums text-white">{value}</b>{stats[key] ?? (key === "dps" ? t("classGuide.full.weaponDps") : key === "armor" ? t("classGuide.full.armor") : key)}</span>)}</div><p className="mt-2 text-[10px] leading-4 text-subtle">{t("classGuide.full.weightsNote")}</p></details>}
  </section>;
};

const RotationPriority = ({ spec, bundle, links, level, hideLocked }: {
  spec: ClassGuideSpec; bundle: ClassGuideBundle; links: Links; level: number; hideLocked: boolean;
}) => {
  const { t } = useTranslation();
  const sections = ([
    { title: t("classGuide.full.opener"), steps: spec.rotation.opener },
    { title: t(spec.role === "Healer" ? "classGuide.full.singleHealing" : spec.role === "Tank" ? "classGuide.full.threat" : "classGuide.full.single"), steps: spec.rotation.single },
    { title: t("classGuide.full.aoe"), steps: spec.rotation.aoe },
    { title: t("classGuide.full.cooldowns"), steps: spec.cooldowns },
  ] as const).filter((section) => section.steps?.length);
  if (!sections.length) return null;
  return <section>
    <h3 className="mb-3 font-display text-base font-semibold text-white">{t("classGuide.full.rotation")}</h3>
    <div className="space-y-3">
      {sections.map((section) => <ClassGuideStepList key={section.title} title={section.title} steps={section.steps} bundle={bundle} links={links} level={level} hideLocked={hideLocked} />)}
    </div>
  </section>;
};

const Tips = ({ title, items, links }: { title: string; items?: string[]; links: Links }) => items?.length ? <section><h3 className="mb-2 text-[13px] font-semibold text-white">{title}</h3><ul className="list-disc space-y-1.5 pl-5 text-[12px] leading-6 text-zinc-300">{items.map((tip, index) => <li key={index}><LinkedText text={tip} links={links} /></li>)}</ul></section> : null;

const PveGuide = ({ spec, bundle, links, level, hideLocked }: {
  spec: ClassGuideSpec; bundle: ClassGuideBundle; links: Links; level: number; hideLocked: boolean;
}) => {
  const { t } = useTranslation();
  const guide = bundle.play.specs[spec.tree]?.pve;
  const buildData = bundle.builds.specs[spec.tree];
  const builds = buildData?.builds.filter((build) => build.purpose !== "pvp") ?? [];
  const [buildId, setBuildId] = useState(guide?.builds?.[String(level)] ?? builds.find((item) => item.level === level)?.id ?? builds[0]?.id ?? "");
  const build = builds.find((item) => item.id === buildId) ?? builds[0];
  const rotation = buildData?.rotations[String(build?.level ?? level)];
  const phases = [
    { title: t("classGuide.full.single"), steps: rotation?.single },
    { title: t("classGuide.full.aoe"), steps: rotation?.aoe },
    { title: t("classGuide.full.opener"), steps: guide?.opener },
    { title: t("classGuide.full.cooldowns"), steps: guide?.cooldowns },
  ];

  return <div className="space-y-5">
    <ClassBuildGuideSections build={build} builds={builds} bundle={bundle} links={links} phases={phases}
      mode="pve" level={build?.level ?? level} hideLocked={hideLocked} onSelect={(item) => setBuildId(item.id)}
      gear={<ClassGuideGearSection classId={bundle.classId} tree={spec.tree} mode="pve" cap={bundle.gameBuild.cap} level={build?.level ?? level} />} />
    {guide && <StatPriority order={guide.stats?.order} weights={guide.weights} stats={bundle.stats} links={links} />}
    {guide && <details className="group rounded-[var(--radius-md)] border border-border bg-surface"><summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[12px] font-semibold text-white marker:hidden focus-visible:outline-2 focus-visible:outline-accent">{t("classGuide.full.pveNotes")}<ChevronDown size={14} className="text-subtle transition-transform group-open:rotate-180" aria-hidden="true" /></summary><div className="space-y-3 border-t border-border px-4 py-3 text-[12px] leading-5 text-zinc-300"><p><LinkedText text={guide.summary} links={links} /></p>{guide.role && <p><LinkedText text={guide.role} links={links} /></p>}{guide.stats?.why && <p><LinkedText text={guide.stats.why} links={links} /></p>}<Tips title={t("classGuide.full.tips")} items={guide.tips} links={links} />{build && build.level >= 30 && guide.at30 && <div><h4 className="font-semibold text-white">{t("classGuide.full.atLevel30")}</h4><p className="mt-1"><LinkedText text={guide.at30.notes} links={links} /></p></div>}</div></details>}
  </div>;
};

const ClassGuideContent = ({ bundle, spec, level, hideLocked, mode }: { bundle: ClassGuideBundle; spec: ClassGuideSpec; level: number; hideLocked: boolean; mode: "specializations" | "pve" | "pvp" }) => {
  const { t } = useTranslation();
  const links = [...bundle.spellNames.entries()].map(([name, value]) => ({
    id: value.id,
    name,
    description: "",
    icon: value.iconId > 0 ? `data/spells/icons/${value.iconId}.webp` : undefined,
  }));
  if (mode === "pve") return <PveGuide key={spec.tree} spec={spec} bundle={bundle} links={links} level={level} hideLocked={hideLocked} />;
  if (mode === "pvp") return <ClassPvpGuide key={spec.tree} spec={spec} bundle={bundle} links={links} level={level} />;
  return <div className="space-y-6">
    <section className="rounded-[var(--radius-md)] border border-border bg-surface p-5">
      <h3 className="font-display text-lg font-semibold text-white">{spec.tree} · {spec.role}</h3>
      <p className="mt-2 max-w-[80ch] text-[12px] leading-6 text-zinc-200"><LinkedText text={spec.summary} links={links} /></p>
      {spec.forever && <div className="mt-4 border-t border-border pt-3"><h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-200"><ForeverLabel text={t("classGuide.full.changed")} /></h4><p className="mt-1 max-w-[80ch] text-[12px] leading-6 text-zinc-300"><LinkedText text={spec.forever} links={links} /></p></div>}
    </section>
    <ClassTalentMilestones spec={spec} bundle={bundle} level={level} />
    <RotationPriority spec={spec} bundle={bundle} links={links} level={level} hideLocked={hideLocked} />
    <StatPriority order={spec.stats} weights={spec.weights} stats={bundle.stats} links={links} />
    <Tips title={t("classGuide.full.tips")} items={spec.tips} links={links} />
  </div>;
};

export default ClassGuideContent;
