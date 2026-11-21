import { ArrowLeft, BookOpen, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import ReferenceBackLink from "../reference/reference-back-link";
import ReferenceSidebarToggle from "../reference/reference-sidebar-toggle";
import type { ReferenceNavigationProps, ReferenceTarget } from "../reference/reference-types";
import StarterGuideArticle from "./starter-guide-article";
import { useStarterGuide, useStarterGuideIndex, type StarterGuideSummary } from "./starter-guide-data";

const guideMenuLabel = (entry: StarterGuideSummary) => entry.menuLabel ?? (entry.group === "class"
  ? /^Leveling (?:a|an) (.+) to 30$/.exec(entry.title)?.[1] ?? entry.title
  : entry.title);

const StarterGuideBrowser = ({ target, backLabel, onBack, onCurrentChange }: ReferenceNavigationProps & { target: ReferenceTarget }) => {
  const { t } = useTranslation();
  const { rows, error: indexError } = useStarterGuideIndex();
  const [selectedId, setSelectedId] = useState(target.id || "getting-started");
  const [query, setQuery] = useState("");
  const [showDetail, setShowDetail] = useState(Boolean(target.id));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { guide, error: guideError } = useStarterGuide(selectedId);
  const selected = rows?.find((entry) => entry.id === selectedId);
  const filtered = useMemo(() => rows?.filter((entry) => `${entry.title} ${entry.intro}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [], [rows, query]);
  useEffect(() => {
    if (selected) onCurrentChange?.({ category: "guides", id: selected.id, name: selected.title });
  }, [selected, onCurrentChange]);

  return <div className="@container flex min-h-0 min-w-0 flex-1 bg-background">
    <aside className={cn("relative min-h-0 w-full shrink-0 flex-col border-r border-border", sidebarCollapsed ? "@min-[800px]:w-10" : "@min-[800px]:w-[calc(16rem*var(--app-font-scale))]", showDetail ? "hidden @min-[800px]:flex" : "flex")}>
      <ReferenceSidebarToggle collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} className="hidden @min-[800px]:grid" />
      <div data-tour="reference-guides" className={cn("shrink-0 border-b border-border p-4", sidebarCollapsed && "@min-[800px]:hidden")}>
        <div className="@min-[800px]:hidden"><ReferenceBackLink label={backLabel} onBack={onBack} /></div>
        <div className="flex items-center justify-between pr-8"><h1 className="font-display text-xl font-semibold text-white">{t("guides.title")}</h1><BookOpen size={19} className="text-accent" aria-hidden="true" /></div>
        <p className="mt-1 text-[11px] leading-5 text-subtle">{t("guides.intro")}</p>
        <label className="mt-3 flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-2 focus-within:border-accent"><Search size={14} className="text-subtle" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("guides.search")} aria-label={t("guides.search")} className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-muted" /></label>
      </div>
      <div className={cn("scroll-slim min-h-0 flex-1 overflow-y-auto p-1.5", sidebarCollapsed && "@min-[800px]:hidden")}>
        {!rows && <p className="p-3 text-[12px] text-subtle" role={indexError ? "alert" : "status"}>{t(indexError ? "guides.loadError" : "reference.loading")}</p>}
        {filtered.map((entry, index) => {
          const isClassGuide = entry.group === "class";
          return <div key={entry.id}>
            {(index === 0 || filtered[index - 1]?.group !== entry.group) && <h2 className={cn("px-2.5 pb-1 pt-3 font-semibold", isClassGuide ? "text-[12px] text-white" : "text-[10px] uppercase tracking-wider text-subtle")}>{t(isClassGuide ? "guides.classLevelingMenuTitle" : `guides.groups.${entry.group}`)}</h2>}
            <div className={cn(isClassGuide && "ml-3 mr-2 border-l border-white/15 pl-3")}>
              <button type="button" onClick={() => { setSelectedId(entry.id); setShowDetail(true); }} aria-current={entry.id === selectedId ? "true" : undefined} className={cn("relative w-full cursor-pointer px-2.5 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent", isClassGuide ? "text-[12px] font-medium" : "rounded-[var(--radius-sm)]", entry.id === selectedId ? isClassGuide ? "bg-accent-soft text-white before:absolute before:-left-[13px] before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:bg-accent" : "bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]" : "hover:bg-white/[0.05]")}><span className={cn("block text-[12px] text-white", !isClassGuide && "font-semibold")}>{guideMenuLabel(entry)}</span></button>
            </div>
          </div>;
        })}
        {rows && filtered.length === 0 && <p className="p-3 text-[12px] text-subtle">{t("database.noMatches")}</p>}
      </div>
    </aside>
    <section className={cn("scroll-slim min-h-0 min-w-0 flex-1 overflow-y-auto", showDetail ? "block" : "hidden @min-[800px]:block")}>
      <div className="ml-0 mr-auto max-w-[1150px] p-4 @min-[800px]:p-5">
        <ReferenceBackLink label={backLabel} onBack={onBack} />
        {showDetail && <button type="button" onClick={() => setShowDetail(false)} className="mb-4 inline-flex cursor-pointer items-center gap-1 text-[12px] font-medium text-accent @min-[800px]:hidden"><ArrowLeft size={14} aria-hidden="true" />{t("guides.backToList")}</button>}
        {guide ? <StarterGuideArticle guide={guide} /> : <p className="rounded-[var(--radius-md)] border border-border bg-surface p-5 text-[12px] text-subtle" role={guideError ? "alert" : "status"}>{t(guideError ? "guides.loadError" : "reference.loading")}</p>}
      </div>
    </section>
  </div>;
};

export default StarterGuideBrowser;
