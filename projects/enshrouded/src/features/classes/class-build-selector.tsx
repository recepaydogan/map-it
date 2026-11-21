import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { ClassBuild } from "./use-class-guide-bundle";

const ClassBuildSelector = ({ builds, selected, cap, onSelect }: {
  builds: ClassBuild[];
  selected: ClassBuild;
  cap: number;
  onSelect: (build: ClassBuild) => void;
}) => {
  const { t } = useTranslation();
  const label = t("classGuide.full.recommendedBuilds");

  return <>
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {builds.map((build) => {
        const active = build.id === selected.id;
        const level = t("classes.level", { level: build.level });
        const purpose = t(`classGuide.full.purpose.${build.purpose}`);
        return <button key={build.id} type="button" onClick={() => onSelect(build)} aria-pressed={active}
          aria-label={`${level} · ${purpose}: ${build.title}`}
          className={cn("inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent",
            active ? "border-accent/60 bg-accent-soft text-white" : "border-border bg-elevated text-zinc-200 hover:border-accent/40 hover:bg-surface-hover")}>
          <span className="whitespace-nowrap">{level} · {purpose}</span>
          {build.level > cap && <span className="rounded border border-border px-1 py-0.5 text-[9px] leading-none text-zinc-300">{t("classGuide.full.preview")}</span>}
        </button>;
      })}
    </div>
  </>;
};

export default ClassBuildSelector;
