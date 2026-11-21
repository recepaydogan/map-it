import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import ItemIcon from "../database/item-icon";
import ReferenceBackLink from "../reference/reference-back-link";
import ReferenceSidebarToggle from "../reference/reference-sidebar-toggle";
import type { ReferenceNavigationProps, ReferenceTarget } from "../reference/reference-types";
import ClassAbilitiesPanel from "./class-abilities-panel";
import ClassRacesPanel from "./class-races-panel";
import ClassRelatedPanel from "./class-related-panel";
import ClassGuidePanel from "./full-class-guide-panel";
import ClassTalentPanel from "./class-talent-panel";
import { useClassCatalog } from "./use-class-catalog";

type ClassTab = "guide" | "talents" | "races" | "abilities" | "gear";
const TABS: ClassTab[] = ["guide", "talents", "races", "abilities", "gear"];
const lastTabByClass = new Map<string, ClassTab>();

const ClassBrowser = ({ target, backLabel, onBack, onCurrentChange }: ReferenceNavigationProps & { target: ReferenceTarget }) => {
  const { t, i18n } = useTranslation();
  const state = useClassCatalog();
  const [selectedId, setSelectedId] = useState(target.id);
  const [tab, setTab] = useState<ClassTab>(() => target.group === "abilities" || target.group === "talents" ? target.group : target.group?.startsWith("guide:") ? "guide" : lastTabByClass.get(target.id) ?? "guide");
  const [mobileDetail, setMobileDetail] = useState(Boolean(target.id));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const entries = state.status === "ready" ? state.catalog.classes : [];
  const current = entries.find((entry) => entry.id === selectedId) ?? entries[0];

  useEffect(() => {
    if (current) onCurrentChange?.({ category: "classes", id: current.id, name: current.name });
  }, [current, onCurrentChange]);

  if (state.status !== "ready") return <p className="p-6 text-sm text-muted" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "classes.error" : "classes.loading")}</p>;

  return <div className="flex min-h-0 flex-1 bg-background">
    <aside className={cn("relative min-h-0 w-full shrink-0 flex-col border-r border-border", sidebarCollapsed ? "md:w-10" : "md:w-56", mobileDetail ? "hidden md:flex" : "flex")}>
      <ReferenceSidebarToggle collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} className="hidden md:grid" />
      <div data-tour="reference-classes" className={cn("border-b border-border px-4 py-4", sidebarCollapsed && "md:hidden")}><h1 className="pr-8 font-display text-lg font-semibold text-white">{t("classes.title")}</h1><p className="mt-1 text-[12px] text-subtle">{t("classes.classCount", { count: entries.length })}</p></div>
      <div className={cn("scroll-slim min-h-0 flex-1 overflow-y-auto p-1.5", sidebarCollapsed && "md:hidden")}>{entries.map((entry) => {
        const raceCount = new Set([...entry.races.alliance, ...entry.races.horde].map((race) => race.id)).size;
        const selected = current?.id === entry.id;
        return <div key={entry.id} className="border-b border-border/60">
          <button type="button" aria-current={selected ? "true" : undefined}
            onClick={() => { setSelectedId(entry.id); setTab("guide"); lastTabByClass.set(entry.id, "guide"); setMobileDetail(false); }}
            className={cn("flex w-full cursor-pointer items-center gap-3 px-2.5 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent",
              selected ? "bg-white/[0.055]" : "hover:bg-white/[0.04]")}>
            <ItemIcon icon={entry.icon} name={entry.name} size={37} />
            <span className="min-w-0"><span className="block text-[13px] font-semibold text-white">{entry.name}</span><span className="block text-[11px] text-subtle">{t("classes.listSummary", { races: raceCount, talents: entry.talentChanges.new })}</span></span>
          </button>
          {selected && <nav aria-label={`${entry.name} ${t("classes.sections")}`} className="ml-[28px] mr-2 mt-2.5 mb-2.5 border-l border-white/15 pl-3">
            {TABS.map((key) => <button key={key} type="button" aria-current={tab === key ? "page" : undefined}
              onClick={() => { setTab(key); lastTabByClass.set(entry.id, key); setMobileDetail(true); }}
              className={cn("relative block w-full cursor-pointer px-3 py-2 text-left text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent",
                tab === key ? "bg-accent-soft text-white before:absolute before:-left-[13px] before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:bg-accent" : "text-muted hover:bg-white/[0.04] hover:text-white")}>{t(`classes.tabs.${key}`)}</button>)}
          </nav>}
        </div>;
      })}</div>
    </aside>

    <section className={cn("min-h-0 min-w-0 flex-1 flex-col", mobileDetail ? "flex" : "hidden md:flex")}>
      {mobileDetail && <button type="button" onClick={() => setMobileDetail(false)} className="flex shrink-0 cursor-pointer items-center gap-1 border-b border-border px-4 py-2.5 text-[13px] text-zinc-300 md:hidden"><ArrowLeft size={16} aria-hidden="true" />{t("classes.title")}</button>}
      {current && <>
        <header className="shrink-0 border-b border-border px-5 py-4">
          <ReferenceBackLink label={backLabel} onBack={onBack} />
          <div className="flex items-center gap-4"><ItemIcon icon={current.icon} name={current.name} size={56} /><div className="min-w-0"><h2 className="font-display text-2xl font-semibold text-white">{current.name}</h2><p className="mt-1 text-[12px] text-subtle">{current.trees.map((tree) => tree.name).join(" · ")}</p></div></div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums"><span className="font-medium text-accent">{t("classes.newCount", { count: current.talentChanges.new.toLocaleString(i18n.language) })}</span><span className="text-zinc-300">{t("classes.changedCount", { count: current.talentChanges.changed.toLocaleString(i18n.language) })}</span><span className="text-subtle">{t("classes.removedCount", { count: current.talentChanges.removed.toLocaleString(i18n.language) })}</span></div>
        </header>
        <div className="@container scroll-slim min-h-0 flex-1 overflow-y-auto"><div className="ml-0 mr-auto max-w-[950px] p-5">
          {tab === "guide" && <ClassGuidePanel key={current.id} entry={current} initialView={target.group === "guide:pvp" ? "pvp" : target.group === "guide:pve" ? "pve" : target.group?.startsWith("guide:") ? "specializations" : "leveling"} />}
          {tab === "talents" && <ClassTalentPanel key={current.id} entry={current} />}
          {tab === "races" && <ClassRacesPanel entry={current} />}
          {tab === "abilities" && <ClassAbilitiesPanel key={current.id} entry={current} />}
          {tab === "gear" && <ClassRelatedPanel entry={current} />}
        </div></div>
      </>}
    </section>
  </div>;
};

export default ClassBrowser;
