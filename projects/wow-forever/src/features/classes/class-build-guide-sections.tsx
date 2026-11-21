import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import BuildTalentGrid from "./build-talent-grid";
import ClassBuildSelector from "./class-build-selector";
import ClassGuideStepList from "./class-guide-step-list";
import type { ClassBuild, ClassGuideBundle, GuideStep } from "./use-class-guide-bundle";

type Links = { id: number; name: string; description: string }[];
type Phase = { title: string; steps?: GuideStep[] };

const ClassBuildGuideSections = ({ build, builds, bundle, links, phases, mode, level, hideLocked, gear, onSelect }: {
  build?: ClassBuild;
  builds: ClassBuild[];
  bundle: ClassGuideBundle;
  links: Links;
  phases: Phase[];
  mode: "pve" | "pvp";
  level: number;
  hideLocked: boolean;
  gear: ReactNode;
  onSelect: (build: ClassBuild) => void;
}) => {
  const { t } = useTranslation();
  const visiblePhases = phases.map((phase) => ({
    ...phase,
    steps: phase.steps?.filter((step) => {
      const unlock = bundle.spellNames.get(step.spell ?? step.ability ?? "")?.level;
      return !hideLocked || !unlock || unlock <= level;
    }),
  })).filter((phase) => phase.steps?.length);
  const [activePhase, setActivePhase] = useState(0);
  const selectedPhase = visiblePhases[Math.min(activePhase, visiblePhases.length - 1)];

  return <>
    {build && <section className="rounded-[var(--radius-md)] border border-border bg-surface p-4" aria-label={t("classGuide.full.talentBuild")}>
      <h3 className="font-display text-base font-semibold text-white">{t("classGuide.full.talentBuild")}</h3>
      <div className="mt-3"><ClassBuildSelector builds={builds} selected={build} cap={bundle.gameBuild.cap} onSelect={onSelect} /></div>
      <div className="mt-3 border-t border-border pt-4"><BuildTalentGrid key={build.id} build={build} bundle={bundle} /></div>
    </section>}

    {gear}

    {selectedPhase && <section className="min-w-0" aria-label={t("classGuide.full.playstyle")}>
      <h3 className="font-display text-lg font-semibold text-white">{t("classGuide.full.playstyle")}</h3>
      <p className="mt-1 text-[12px] leading-5 text-zinc-300">{t(mode === "pve" ? "classGuide.full.sharedPvePriorities" : "classGuide.full.sharedPvpPriorities")}</p>
      <div role="group" aria-label={t("classGuide.full.playstylePhases")} className="mt-4 flex max-w-full gap-1 overflow-x-auto border-b border-border">
        {visiblePhases.map((phase, index) => <button key={phase.title} type="button" onClick={() => setActivePhase(index)} aria-pressed={selectedPhase === phase}
          className={cn("flex min-h-10 shrink-0 cursor-pointer items-center gap-2 border-b-2 px-3 py-2 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent", selectedPhase === phase ? "border-accent text-white" : "border-transparent text-zinc-300 hover:text-white")}>
          <span>{phase.title}</span><span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", selectedPhase === phase ? "bg-accent-soft text-white" : "bg-elevated text-zinc-300")}>{phase.steps?.length}</span>
        </button>)}
      </div>
      <div className="pt-3"><ClassGuideStepList key={selectedPhase.title} title={selectedPhase.title} steps={selectedPhase.steps} bundle={bundle} links={links} level={level} hideLocked={hideLocked} /></div>
    </section>}
  </>;
};

export default ClassBuildGuideSections;
