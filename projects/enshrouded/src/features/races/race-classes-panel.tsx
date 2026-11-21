import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import DatabaseSectionTitle from "../database/database-section-title";
import ItemIcon from "../database/item-icon";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import type { RaceEntry } from "./race-types";

const RaceClassesPanel = ({ entry }: { entry: RaceEntry }) => {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  return <div className="space-y-4">
    <DatabaseSectionTitle count={entry.classes.length}>{t("races.playableClasses")}</DatabaseSectionTitle>
    <div className="grid gap-2 @min-[760px]:grid-cols-2">{entry.classes.map((classEntry) => {
      const rule = entry.factionRules[classEntry.id];
      return <button key={classEntry.id} type="button" onClick={() => openReference({ category: "classes", id: classEntry.id, name: classEntry.name })}
        className="flex min-w-0 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent">
        {classEntry.icon && <ItemIcon icon={classEntry.icon} name={classEntry.name} size={35} />}
        <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-white">{classEntry.name}</span>
          {rule && <span className={cn("block text-[11px]", rule === "alliance" ? "text-sky-300" : "text-rose-300")}>{t("races.racePageFaction", { faction: t(`races.factions.${rule}`) })}</span>}</span>
        {classEntry.newCombination && <span className="shrink-0 rounded-[var(--radius-sm)] bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">{t("races.newCombination")}</span>}
        <ArrowUpRight size={14} className="shrink-0 text-accent" aria-hidden="true" />
      </button>;
    })}</div>
    {!!entry.factionConflicts.length && <p className="rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-[11px] leading-5 text-subtle">{t("races.factionConflict")}</p>}
  </div>;
};

export default RaceClassesPanel;
