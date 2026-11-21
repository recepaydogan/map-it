import { ArrowUpRight, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameNames } from "../../i18n/use-game-names";
import DatabaseSectionTitle from "../database/database-section-title";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import RacePortrait from "../races/race-portrait";
import type { GameClass } from "./class-types";
import { useForeverDbClassGuides } from "./use-foreverdb-class-guides";

const ClassRacesPanel = ({ entry }: { entry: GameClass }) => {
  const { t } = useTranslation();
  const { raceName: gameRaceName } = useGameNames();
  const openReference = useReferenceNavigation();
  const { entries } = useForeverDbClassGuides();
  const picks = entries?.[entry.id]?.racePicks;
  return <div className="space-y-4">
    {picks && <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-accent/25 bg-accent-soft px-3 py-2.5">
      <p className="flex items-center gap-2 text-[11px] leading-5 text-zinc-200"><Sparkles size={14} className="shrink-0 text-accent" aria-hidden="true" />{t("classGuide.racePickNote")}</p>
    </div>}
    <div className="grid gap-4 sm:grid-cols-2">{(["alliance", "horde"] as const).map((faction) => <section key={faction}>
      <DatabaseSectionTitle count={entry.races[faction].length}>{t(`classes.${faction}`)}</DatabaseSectionTitle>
      <div className="space-y-2">{entry.races[faction].map((race) => <button key={race.id} type="button" onClick={() => openReference({ category: "races", id: race.id, name: gameRaceName(race.id, race.name) })} className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent">
        {race.icon && <RacePortrait icon={race.icon} size={32} />}
        <span className="min-w-0 flex-1 text-[13px] font-medium text-white">{gameRaceName(race.id, race.name)}</span>
        {picks?.[faction].includes(race.id) && <span className="shrink-0 rounded-[var(--radius-sm)] border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">{t("classGuide.racePick")}</span>}
        {race.newCombination && <span className="shrink-0 rounded-[var(--radius-sm)] border border-accent/40 bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">{t("classes.newCombination")}</span>}
        <ArrowUpRight size={13} className="shrink-0 text-accent" aria-hidden="true" />
      </button>)}</div>
    </section>)}</div>
  </div>;
};

export default ClassRacesPanel;
