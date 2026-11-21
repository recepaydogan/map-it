import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import InlineAbilityLinks from "../../components/inline-ability-links";
import ReferenceBackLink from "../reference/reference-back-link";
import ReferenceSidebarToggle from "../reference/reference-sidebar-toggle";
import type { ReferenceNavigationProps, ReferenceTarget } from "../reference/reference-types";
import RaceClassesPanel from "./race-classes-panel";
import RaceRacialsPanel from "./race-racials-panel";
import RacePortrait from "./race-portrait";
import { useRaceCatalog } from "./use-race-catalog";

type RaceTab = "racials" | "classes";
const lastTabByRace = new Map<string, RaceTab>();
const GROUPS = ["alliance", "horde", "both"] as const;

const RaceBrowser = ({ target, backLabel, onBack, onCurrentChange }: ReferenceNavigationProps & { target: ReferenceTarget }) => {
  const { t } = useTranslation();
  const state = useRaceCatalog();
  const [selectedId, setSelectedId] = useState(target.id);
  const [tab, setTab] = useState<RaceTab>(() => lastTabByRace.get(target.id) ?? "racials");
  const [mobileDetail, setMobileDetail] = useState(Boolean(target.id));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const entries = state.status === "ready" ? state.catalog.races : [];
  const current = entries.find((entry) => entry.id === selectedId) ?? entries[0];

  useEffect(() => {
    if (current) onCurrentChange?.({ category: "races", id: current.id, name: current.name });
  }, [current, onCurrentChange]);

  if (state.status !== "ready") return <p className="p-6 text-sm text-muted" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "races.error" : "races.loading")}</p>;

  return <div className="flex min-h-0 flex-1 bg-background">
    <aside className={cn("relative min-h-0 w-full shrink-0 flex-col border-r border-border", sidebarCollapsed ? "md:w-10" : "md:w-56", mobileDetail ? "hidden md:flex" : "flex") }>
      <ReferenceSidebarToggle collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} className="hidden md:grid" />
      <div data-tour="reference-races" className={cn("border-b border-border px-4 py-4", sidebarCollapsed && "md:hidden")}><h1 className="pr-8 font-display text-lg font-semibold text-white">{t("races.title")}</h1><p className="mt-1 text-[12px] text-subtle">{t("races.raceCount", { count: entries.length })}</p></div>
      <div className={cn("scroll-slim min-h-0 flex-1 overflow-y-auto p-1.5", sidebarCollapsed && "md:hidden")}>{GROUPS.map((faction) => <div key={faction}>
        <p className={cn("px-2.5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em]", faction === "alliance" ? "text-sky-300" : faction === "horde" ? "text-rose-300" : "text-accent")}>{t(`races.factions.${faction}`)}</p>
        {entries.filter((entry) => entry.faction === faction).map((entry) => <button key={entry.id} type="button" aria-current={current?.id === entry.id ? "true" : undefined}
          onClick={() => { setSelectedId(entry.id); setTab("racials"); lastTabByRace.set(entry.id, "racials"); setMobileDetail(true); }}
          className={cn("flex w-full cursor-pointer items-center gap-3 border-b border-border/60 px-2.5 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent",
            current?.id === entry.id ? "bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]" : "hover:bg-white/[0.04]")}>
          <RacePortrait icon={entry.icon} size={36} />
          <span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-white">{entry.name}</span><span className="block text-[11px] text-subtle">{t("races.listSummary", { classes: entry.classCount, racials: entry.racialCount })}</span></span>
        </button>)}
      </div>)}</div>
    </aside>

    <section className={cn("min-h-0 min-w-0 flex-1 flex-col", mobileDetail ? "flex" : "hidden md:flex")}>
      {mobileDetail && <button type="button" onClick={() => setMobileDetail(false)} className="flex shrink-0 cursor-pointer items-center gap-1 border-b border-border px-4 py-2.5 text-[13px] text-zinc-300 md:hidden"><ArrowLeft size={16} aria-hidden="true" />{t("races.title")}</button>}
      {current && <>
        <header className="shrink-0 border-b border-border px-5 py-4">
          <ReferenceBackLink label={backLabel} onBack={onBack} />
          <div className="flex items-center gap-4"><RacePortrait icon={current.icon} size={58} />
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-2xl font-semibold text-white">{current.name}</h2>
              {current.newRace && <span className="rounded-[var(--radius-sm)] border border-accent/40 bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">{t("races.newRace")}</span>}</div>
              <p className={cn("mt-0.5 text-[12px] font-medium", current.faction === "alliance" ? "text-sky-300" : current.faction === "horde" ? "text-rose-300" : "text-accent")}>{t(`races.factions.${current.faction}`)}</p></div>
          </div>
          <p className="mt-3 max-w-2xl text-[12px] leading-5 text-zinc-300"><InlineAbilityLinks text={current.description}
            abilities={current.racials.map((ability) => ({ name: ability.name, icon: ability.icon,
              description: current.id === "gnome" && ability.name === "Eureka!"
                ? t("races.patch.eureka") : ability.fullEffect ?? ability.effect }))} /></p>
        </header>
        <div className="scroll-slim flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3" role="tablist" aria-label={t("races.sections")}>{(["racials", "classes"] as const).map((key) => <button key={key} type="button" role="tab" aria-selected={tab === key}
          onClick={() => { setTab(key); lastTabByRace.set(current.id, key); }} className={cn("shrink-0 cursor-pointer border-b-2 px-3 py-3 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent",
            tab === key ? "border-accent text-white" : "border-transparent text-muted hover:text-white")}>{t(`races.tabs.${key}`)}<span className="ml-1.5 text-subtle">{key === "racials" ? current.racialCount : current.classCount}</span></button>)}</div>
        <div className="@container scroll-slim min-h-0 flex-1 overflow-y-auto" role="tabpanel"><div className="ml-0 mr-auto max-w-[950px] p-5">
          {tab === "racials" ? <RaceRacialsPanel entry={current} /> : <RaceClassesPanel entry={current} />}
        </div></div>
      </>}
    </section>
  </div>;
};

export default RaceBrowser;
