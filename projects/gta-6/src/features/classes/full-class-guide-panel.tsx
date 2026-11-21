import { classRoleKey } from "./class-role-key";
import { useState } from "react";
import { useGameNames } from "../../i18n/use-game-names";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { contentUrl } from "../../lib/content-url";
import StarterGuideArticle from "../guides/starter-guide-article";
import { useStarterGuide } from "../guides/starter-guide-data";
import ClassGuideContent from "./class-guide-content";
import type { GameClass } from "./class-types";
import { useClassGuideBundle } from "./use-class-guide-bundle";

const FullClassGuidePanel = ({ entry, initialView = "leveling" }: {
  entry: GameClass;
  initialView?: "leveling" | "specializations" | "pve" | "pvp";
}) => {
  const { t } = useTranslation();
  const { specializationName } = useGameNames();
  const { data, error } = useClassGuideBundle(entry.id);
  const { guide: levelingGuide, error: levelingError } = useStarterGuide(`leveling-${entry.id}`);
  const [guideView, setGuideView] = useState<"leveling" | "specializations" | "pve" | "pvp">(initialView);
  const [specIndex, setSpecIndex] = useState(0);
  const level = data?.gameBuild.cap ?? 20;
  const spec = data?.guide.specs[specIndex];

  return <div className={cn("space-y-5", guideView !== "leveling" && "class-guide-article")}>
    <div role="tablist" aria-label={t("classes.tabs.guide")} className="flex max-w-full gap-5 overflow-x-auto border-b border-border">
      {(["leveling", "specializations", "pve", "pvp"] as const).map((view) => <button key={view} type="button" role="tab" aria-selected={guideView === view} onClick={() => setGuideView(view)} className={cn("shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-0.5 pb-3 pt-1 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent", guideView === view ? "border-accent font-semibold text-white" : "border-transparent text-zinc-300 hover:text-white")}>{t(`classGuide.full.${view === "leveling" ? "levelingGuide" : view === "specializations" ? "specializationGuide" : view === "pve" ? "pveGuide" : "pvpGuide"}`)}</button>)}
    </div>
    {guideView === "leveling" ? levelingGuide ? <StarterGuideArticle guide={levelingGuide} tone="class-leveling" /> : <div className="rounded-[var(--radius-md)] border border-border bg-surface p-5 text-[12px] text-subtle" role={levelingError ? "alert" : "status"}>{t(levelingError ? "guides.loadError" : "reference.loading")}</div> : !data ? <div className="rounded-[var(--radius-md)] border border-border bg-surface p-5 text-[12px] text-subtle" role={error ? "alert" : "status"}>{t(error ? "classGuide.full.loadError" : "classes.loading")}</div> : <div className="space-y-5">
    <section aria-label={t("classGuide.specializations")}>
      <h3 className="mb-2 text-[13px] font-semibold text-zinc-200">{t("classGuide.choosePath")}</h3>
      <div className="flex max-w-full gap-1 overflow-x-auto border-b border-border" role="group" aria-label={t("classGuide.choosePath")}>{data.guide.specs.map((item, index) => {
        const selected = specIndex === index;
        return <button key={item.tree} type="button" onClick={() => setSpecIndex(index)} aria-pressed={selected}
          className={cn("flex min-h-14 shrink-0 cursor-pointer items-center gap-2 border-b-2 px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent", selected ? "border-accent text-white" : "border-transparent text-zinc-300 hover:text-white")}
        >
          {entry.trees[index]?.icon && <img src={contentUrl(entry.trees[index].icon!)} alt="" className="size-7 shrink-0 rounded-[var(--radius-sm)] border border-border object-cover" />}
          <span className="min-w-0"><span className="block text-[12px] font-semibold leading-4">{specializationName(entry.id, item.tree)}</span><span className="mt-0.5 block text-[10px] leading-4 text-subtle">{classRoleKey(item.role) ? t(classRoleKey(item.role)!) : item.role}</span></span>
        </button>;
      })}</div>
    </section>
    {spec && <div key={`${guideView}-${spec.tree}`} className="guide-content-enter"><ClassGuideContent bundle={data} spec={spec} level={level} hideLocked={false} mode={guideView} /></div>}
    <p className="border-t border-border pt-4 text-[11px] leading-5 text-subtle">{t("classGuide.full.betaNotice", { build: data.gameBuild.version })}</p>
    </div>}
  </div>;
};

export default FullClassGuidePanel;
