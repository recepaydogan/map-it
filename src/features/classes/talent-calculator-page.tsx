import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import ItemIcon from "../database/item-icon";
import ClassTalentCalculator from "./class-talent-calculator";
import { useClassCatalog } from "./use-class-catalog";

const selectionKey = "talent-calculator:selected-class";

function savedClass() {
  try { return localStorage.getItem(selectionKey) || "druid"; } catch { return "druid"; }
}

const TalentCalculatorPage = ({ initialClassId }: { initialClassId?: string }) => {
  const { t } = useTranslation();
  const catalog = useClassCatalog();
  const [selectedId, setSelectedId] = useState(() => initialClassId ?? savedClass());
  const entries = catalog.status === "ready" ? catalog.catalog.classes : [];
  const selected = entries.find((entry) => entry.id === selectedId) ?? entries[0];

  return <div className="flat-reference absolute inset-0 flex min-h-0 flex-col bg-background animate-fade-in">
    <header className="shrink-0 border-b border-border px-5 py-4">
      <h1 className="font-display text-xl font-semibold text-white">{t("classes.calculator.title")}</h1>
      <p className="mt-1 text-[12px] text-subtle">{t("classes.calculator.selectClass")}</p>
    </header>
    <div className="@container scroll-slim min-h-0 flex-1 overflow-y-auto p-5">
      <div className="mx-auto max-w-[1100px] space-y-5">
        {catalog.status === "error" ? <p role="alert" className="text-sm text-muted">{t("classes.error")}</p> :
          catalog.status === "loading" ? <p role="status" className="text-sm text-muted">{t("classes.loading")}</p> : <>
            <div className="grid grid-cols-3 gap-2 @min-[580px]:grid-cols-5 @min-[950px]:grid-cols-9" role="group" aria-label={t("classes.calculator.selectClass")}>
              {entries.map((entry) => <button key={entry.id} type="button" onClick={() => {
                setSelectedId(entry.id);
                try { localStorage.setItem(selectionKey, entry.id); } catch { /* Selection still works for this session. */ }
              }} aria-pressed={selected?.id === entry.id}
                className={cn("flex min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border px-2 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent",
                  selected?.id === entry.id ? "border-accent bg-accent-soft text-white" : "border-border bg-surface text-zinc-300 hover:border-accent/50 hover:text-white") }>
                <ItemIcon icon={entry.icon} name={entry.name} size={30} />
                <span className="min-w-0 truncate text-[11px] font-semibold">{entry.name}</span>
              </button>)}
            </div>
            {selected && <ClassTalentCalculator key={selected.id} classId={selected.id} />}
          </>}
      </div>
    </div>
  </div>;
};

export default TalentCalculatorPage;
