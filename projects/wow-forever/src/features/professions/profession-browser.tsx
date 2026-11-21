import { ArrowLeft, BookOpen, CircleUserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameNames } from "../../i18n/use-game-names";
import { cn } from "../../lib/cn";
import ItemIcon from "../database/item-icon";
import ReferenceBackLink from "../reference/reference-back-link";
import ReferenceSidebarToggle from "../reference/reference-sidebar-toggle";
import type { ReferenceNavigationProps, ReferenceTarget } from "../reference/reference-types";
import ProfessionClassesPanel from "./profession-classes-panel";
import ProfessionFinderPanel from "./profession-finder-panel";
import ProfessionLevelingPanel from "./profession-leveling-panel";
import ProfessionOverviewPanel from "./profession-overview-panel";
import ProfessionRecipesPanel from "./profession-recipes-panel";
import ProfessionTrainersPanel from "./profession-trainers-panel";
import MyProfessionsPanel from "./my-professions-panel";
import { useProfessionCatalog } from "./use-profession-catalog";
import { useProfessionDetails } from "./use-profession-details";
import { useProfessionLeveling } from "./use-profession-leveling";

type ProfessionTab = "overview" | "leveling" | "recipes" | "trainers" | "classes";
type ProfessionView = ProfessionTab | "finder" | "my";
const lastTabByProfession = new Map<string, ProfessionTab>();

const ProfessionBrowser = ({ target, backLabel, onBack, onCurrentChange, onOpenMap }: ReferenceNavigationProps & {
  target: ReferenceTarget;
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t, i18n } = useTranslation();
  const { professionName: gameProfessionName } = useGameNames();
  const state = useProfessionCatalog();
  const [selectedId, setSelectedId] = useState(target.id);
  const [selectedClass, setSelectedClass] = useState<string | null>(target.group?.startsWith("class:")
    ? target.group.slice(6).replace(/^./, (letter) => letter.toUpperCase()) : null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(target.group?.startsWith("recipe:") ? target.group.slice(7) : null);
  const [returnToFinder, setReturnToFinder] = useState(false);
  const [returnToLeveling, setReturnToLeveling] = useState(false);
  const [tab, setTab] = useState<ProfessionView>(() => target.id === "my-professions" ? "my" : target.id === "all-recipes" ? "finder"
    : target.group === "leveling" ? "leveling" : target.group?.startsWith("class:") ? "classes" : target.group?.startsWith("recipe:") ? "recipes" : lastTabByProfession.get(target.id) ?? "overview");
  const [mobileDetail, setMobileDetail] = useState(Boolean(target.id));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const entries = state.status === "ready" ? state.catalog.professions : [];
  const totalRecipeCount = entries.reduce((count, entry) => count + entry.recipes.length, 0);
  const current = entries.find((entry) => entry.id === selectedId) ?? entries[0];
  const currentName = current ? gameProfessionName(current.id, current.name) : "";
  const details = useProfessionDetails(current?.id ?? "camping");
  const leveling = useProfessionLeveling(current?.id ?? "camping");
  const classLinkedCount = current?.recipes.filter((recipe) => recipe.classes?.length).length ?? 0;
  const selectedRecipe = current?.recipes.find((recipe) => recipe.id === selectedRecipeId);

  useEffect(() => {
    if (tab === "my") onCurrentChange?.({ category: "professions", id: "my-professions", name: t("myProfessions.title") });
    else if (tab === "finder") onCurrentChange?.({ category: "professions", id: "all-recipes", name: t("professions.finderTitle") });
    else if (current) onCurrentChange?.({ category: "professions", id: current.id, name: selectedRecipe?.name ?? currentName,
      ...(selectedRecipe ? { group: `recipe:${selectedRecipe.id}` } : selectedClass ? { group: `class:${selectedClass.toLowerCase()}` } : {}) });
  }, [current, currentName, onCurrentChange, selectedClass, selectedRecipe, tab, t]);

  if (state.status !== "ready") return <p className="p-6 text-sm text-muted" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "professions.error" : "professions.loading")}</p>;

  return <div className="reference-panels @container flex min-h-0 min-w-0 flex-1">
    <aside className={cn("reference-categories relative min-h-0 w-full shrink-0 flex-col overflow-hidden", sidebarCollapsed ? "@min-[768px]:w-10" : "@min-[768px]:w-56", mobileDetail ? "hidden @min-[768px]:flex" : "flex")}>
      <ReferenceSidebarToggle collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} className="hidden @min-[768px]:grid" />
      <div data-tour="reference-professions" className={cn("border-b border-border px-4 py-4", sidebarCollapsed && "@min-[768px]:hidden")}><h1 className="pr-8 font-display text-lg font-semibold text-white">{t("professions.title")}</h1><p className="mt-1 text-[12px] text-subtle">{t("professions.professionCount", { count: entries.length })}</p></div>
      <div className={cn("scroll-slim min-h-0 flex-1 overflow-y-auto p-1.5", sidebarCollapsed && "@min-[768px]:hidden")}>
        <button type="button" aria-current={tab === "my" ? "true" : undefined}
          onClick={() => { setTab("my"); setSelectedClass(null); setSelectedRecipeId(null); setMobileDetail(true); }}
          className={cn("flex min-h-16 w-full cursor-pointer items-center gap-3 border-b border-border px-2.5 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-accent", tab === "my" ? "bg-surface shadow-[inset_2px_0_0_var(--color-accent)]" : "hover:bg-surface")}>
          <span className="grid size-[35px] shrink-0 place-items-center rounded-[var(--radius-sm)] border border-border text-muted"><CircleUserRound size={19} aria-hidden="true" /></span>
          <span className="min-w-0"><span className="block text-[13px] font-semibold text-white">{t("myProfessions.title")}</span><span className="mt-0.5 block text-[11px] text-subtle">{t("myProfessions.subtitle")}</span></span>
        </button>
        <button type="button" aria-current={tab === "finder" ? "true" : undefined}
          onClick={() => { setTab("finder"); setSelectedClass(null); setSelectedRecipeId(null); setReturnToFinder(false); setReturnToLeveling(false); setMobileDetail(true); }}
          className={cn("flex w-full cursor-pointer items-center gap-3 border-b border-border/60 px-2.5 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent",
            tab === "finder" ? "bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]" : "hover:bg-white/[0.04]")}>
          <span className="flex size-[35px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-accent/25 bg-accent-soft text-accent"><BookOpen size={17} aria-hidden="true" /></span>
          <span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-white">{t("professions.tabs.finder")}</span>
            <span className="block text-[11px] text-subtle">{t("professions.recipeCount", { count: totalRecipeCount.toLocaleString(i18n.language) })}</span></span>
        </button>
        {(["primary", "secondary"] as const).map((kind) => <div key={kind}>
        <p className="px-2.5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">{t(`professions.${kind}`)}</p>
        {entries.filter((entry) => entry.kind === kind).map((entry) => <button key={entry.id} type="button" aria-current={tab !== "finder" && tab !== "my" && current?.id === entry.id ? "true" : undefined}
          onClick={() => { setSelectedId(entry.id); setSelectedClass(null); setSelectedRecipeId(null); setReturnToFinder(false); setReturnToLeveling(false); setTab("overview"); lastTabByProfession.set(entry.id, "overview"); setMobileDetail(true); }}
          className={cn("flex w-full cursor-pointer items-center gap-3 border-b border-border/60 px-2.5 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent",
            tab !== "finder" && tab !== "my" && current?.id === entry.id ? "bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]" : "hover:bg-white/[0.04]")}>
          {entry.icon && <ItemIcon icon={entry.icon} name={gameProfessionName(entry.id, entry.name)} size={35} />}
          <span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-white">{gameProfessionName(entry.id, entry.name)}</span><span className="block text-[11px] text-subtle">{t("professions.listSummary", { count: entry.recipeCount, newCount: entry.newRecipeCount })}</span></span>
        </button>)}
      </div>)}
      </div>
    </aside>

    <section className={cn("reference-content min-h-0 min-w-0 flex-1 flex-col overflow-hidden", mobileDetail ? "flex" : "hidden @min-[768px]:flex")}>
      {mobileDetail && <button type="button" onClick={() => setMobileDetail(false)} className="flex shrink-0 cursor-pointer items-center gap-1 border-b border-border px-4 py-2.5 text-[13px] text-zinc-300 @min-[768px]:hidden"><ArrowLeft size={16} aria-hidden="true" />{t("professions.title")}</button>}
      {current && <>
        <header className="shrink-0 border-b border-border px-5 py-4">
          {!selectedRecipe && <ReferenceBackLink label={backLabel} onBack={onBack} />}
          <div className="flex items-center gap-4">{tab !== "finder" && tab !== "my" && current.icon && <ItemIcon icon={current.icon} name={currentName} size={56} />}
            <div className="min-w-0"><h2 className="font-display text-2xl font-semibold text-white">{tab === "my" ? t("myProfessions.title") : tab === "finder" ? t("professions.finderTitle") : currentName}</h2>{tab !== "finder" && tab !== "my" && <p className="mt-1 text-[12px] text-subtle">{current.subtitle}</p>}</div></div>
          {tab !== "finder" && tab !== "my" && <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums"><span className="font-medium text-accent">{t("professions.recipeCount", { count: current.recipeCount.toLocaleString(i18n.language) })}</span>
            <span className="text-zinc-300">{t("professions.newCount", { count: current.newRecipeCount.toLocaleString(i18n.language) })}</span>
            <span className="text-subtle">{t("professions.skillSpan", { span: current.skillSpan })}</span>
          </div>}
        </header>
        {tab !== "finder" && tab !== "my" && <div className="scroll-slim flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3" role="tablist" aria-label={t("professions.sections")}>
          {(["overview", ...(current.id !== "camping" ? ["leveling"] : []), "recipes", ...(current.id !== "camping" ? ["trainers"] : []), ...(classLinkedCount ? ["classes"] : [])] as ProfessionTab[]).map((key) => <button key={key} type="button" role="tab" aria-selected={tab === key}
            onClick={() => { setTab(key); setSelectedRecipeId(null); setReturnToFinder(false); setReturnToLeveling(false); lastTabByProfession.set(current.id, key); }}
            className={cn("shrink-0 cursor-pointer border-b-2 px-3 py-3 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent",
              tab === key ? "border-accent text-white" : "border-transparent text-muted hover:text-white")}>{t(`professions.tabs.${key}`)}{key === "classes" && <span className="ml-1.5 text-subtle">{classLinkedCount}</span>}{key === "trainers" && details.data && <span className="ml-1.5 text-subtle">{details.data.trainers.length}</span>}</button>)}
        </div>}
        <div className="@container scroll-slim min-h-0 flex-1 overflow-y-auto" role="tabpanel"><div className={cn("ml-0 mr-auto p-5", (tab !== "recipes" || selectedRecipeId) && "max-w-[950px]")}>
          {tab === "my" && <MyProfessionsPanel entries={entries} />}
          {tab === "overview" && <ProfessionOverviewPanel entry={current} sourceRecipes={details.data?.recipes ?? []} onOpenRecipes={() => { setTab("recipes"); lastTabByProfession.set(current.id, "recipes"); }} />}
          {tab === "leveling" && (leveling.guide ? <ProfessionLevelingPanel key={current.id} entry={current} guide={leveling.guide} onOpenRecipe={(recipeId) => {
            setSelectedRecipeId(recipeId); setReturnToFinder(false); setReturnToLeveling(true); setTab("recipes");
          }} /> : <p className="py-8 text-center text-[12px] text-subtle" role={leveling.error ? "alert" : "status"}>{t(leveling.error ? "professions.error" : leveling.missing ? "professions.leveling.noGuide" : "professions.loading")}</p>)}
          {tab === "recipes" && selectedRecipeId && current.id !== "camping" && !details.data
            ? <p className="py-8 text-center text-[12px] text-subtle" role={details.error ? "alert" : "status"}>{t(details.error ? "professions.error" : "professions.loading")}</p>
            : tab === "recipes" && <ProfessionRecipesPanel key={current.id} entry={current} sourceRecipes={details.data?.recipes ?? []} sourceItems={details.data?.items ?? {}} trainers={details.data?.trainers ?? []} classicRecipeTrainers={details.data?.classicRecipeTrainers ?? {}} classicTrainerNames={details.data?.classicTrainerNames ?? {}} selectedRecipeId={selectedRecipeId ?? undefined} backLabel={returnToLeveling ? t("professions.backToLeveling") : undefined} onShowTrainers={current.id !== "camping" ? () => {
            setSelectedRecipeId(null); setReturnToFinder(false); setReturnToLeveling(false); setTab("trainers"); lastTabByProfession.set(current.id, "trainers");
          } : undefined} onBack={returnToFinder ? () => {
            setSelectedRecipeId(null); setTab("finder"); setReturnToFinder(false);
          } : returnToLeveling ? () => {
            setSelectedRecipeId(null); setTab("leveling"); setReturnToLeveling(false); lastTabByProfession.set(current.id, "leveling");
          } : onBack} />}
          {tab === "finder" && <ProfessionFinderPanel professions={entries} onSelect={(profession, recipe) => {
            setSelectedId(profession.id); setSelectedRecipeId(recipe.id); setSelectedClass(null); setReturnToFinder(true); setReturnToLeveling(false);
            setTab("recipes"); lastTabByProfession.set(profession.id, "recipes"); setMobileDetail(true);
          }} />}
          {tab === "trainers" && (details.data ? <ProfessionTrainersPanel key={current.id} trainers={details.data.trainers} onOpenMap={onOpenMap} /> : <p className="py-8 text-center text-[12px] text-subtle" role={details.error ? "alert" : "status"}>{t(details.error ? "professions.error" : "professions.loading")}</p>)}
          {tab === "classes" && classLinkedCount > 0 && <ProfessionClassesPanel entry={current} selectedClass={selectedClass} onSelectClass={setSelectedClass} />}
        </div></div>
      </>}
    </section>
  </div>;
};

export default ProfessionBrowser;
