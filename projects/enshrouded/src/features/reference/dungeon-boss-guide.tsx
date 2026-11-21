import { ChevronDown, Swords } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import SpellLink from "../spells/spell-link";
import { useReferenceNavigation, useSelectedReference } from "./reference-navigation-context";
import DatabaseSectionTitle from "../database/database-section-title";
import ProgressiveList from "../../components/progressive-list";
import { dungeonBossTarget, isDungeonBossTarget } from "./dungeon-boss-target";
import { cachedBossData, loadBossData, type BossData } from "./dungeon-boss-data";

const DungeonBossGuide = ({ dungeonId, encounters = [], compact = false }: {
  dungeonId: string;
  encounters?: { id: number; nameKey: string }[];
  compact?: boolean;
}) => {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  const selectedReference = useSelectedReference();
  const [data, setData] = useState<BossData | null>(cachedBossData);
  const [visibleCount, setVisibleCount] = useState(6);
  useEffect(() => {
    let active = true;
    void loadBossData().then((value) => { if (active) setData(value); }).catch((error: unknown) => {
      console.error("Failed to load dungeon boss guide", error);
    });
    return () => { active = false; };
  }, []);
  const guide = data?.guides[dungeonId];
  const sourceRoster = data?.rosters[dungeonId];
  const roster = !guide && !encounters.length ? sourceRoster : undefined;
  const names = guide?.bosses.map((boss) => boss.name)
    ?? (encounters.length ? encounters.map((encounter) => t(encounter.nameKey)) : roster?.bosses ?? []);
  if (!names.length) return null;
  if (compact && dungeonId !== "mapgenie-instance-949847") return <section aria-label={t("reference.labels.bosses")}>
    <DatabaseSectionTitle count={names.length}>{t("reference.labels.bosses")}</DatabaseSectionTitle>
    <ProgressiveList initialCount={dungeonId === "mapgenie-instance-949849" ? 3 : 8}
      pageSize={dungeonId === "mapgenie-instance-949849" ? names.length : 6}
      className="space-y-1.5">{names.map((name, index) => <div key={`${name}-${index}`}
      className="flex min-w-0 items-center gap-3 rounded-[var(--radius-md)] border border-danger/35 bg-danger/10 px-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-danger/15 text-danger-text"><Swords size={16} aria-hidden="true" /></span>
      <span className="min-w-0 text-[13px] font-medium leading-snug text-zinc-100">{name}</span>
      {guide?.bosses[index]?.rare && <span className="ml-auto shrink-0 rounded-full border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">{t("bossGuide.rare")}</span>}
    </div>)}</ProgressiveList>
  </section>;
  const shownNames = names.slice(0, visibleCount);

  return <section className="space-y-3" aria-label={t("bossGuide.title")}>
    <DatabaseSectionTitle count={names.length}>{t("bossGuide.title")}</DatabaseSectionTitle>

    {guide ? <div className="space-y-1.5">{guide.bosses.map((boss, index) => {
      const target = dungeonBossTarget(dungeonId, index, boss.name);
      const selected = isDungeonBossTarget(selectedReference) && selectedReference?.id === dungeonId
        && selectedReference.group === target.group;
      return <button key={boss.name} type="button" aria-pressed={selected} onClick={() => openReference(target)}
        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-accent ${selected ? "border-accent/45 bg-accent-soft text-zinc-100" : "border-border bg-white/[0.025] text-zinc-300 hover:border-accent/35"}`}>
        <span className="grid size-6 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-danger/15 text-danger-text"><Swords size={14} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1 text-[12px] font-semibold leading-snug">{boss.name}</span>
        {boss.rare && <span className="shrink-0 text-[10px] font-medium text-accent">{t("bossGuide.rare")}</span>}
      </button>;
    })}</div> : <>
      <ol className="gap-x-1.5 @min-[560px]:columns-2">{shownNames.map((name, index) => {
        const mechanic = sourceRoster?.mechanics?.[name];
        return <li key={`${name}-${index}`} className="mb-1.5 min-w-0 break-inside-avoid rounded-[var(--radius-sm)] border border-border bg-white/[0.025] text-[12px] text-zinc-200">
          {mechanic?.abilities.length ? <details className="group"><summary className="flex cursor-pointer list-none items-center gap-2.5 px-2.5 py-2 marker:hidden focus-visible:outline-2 focus-visible:outline-accent"><span className="w-5 shrink-0 text-right text-[10px] font-semibold tabular-nums text-subtle">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1 font-medium">{name}</span><ChevronDown size={13} className="text-subtle transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
            <div className="border-t border-border px-3 py-3"><ul className="space-y-1.5">{mechanic.abilities.map((ability, abilityIndex) => <li key={`${ability.spellId}-${abilityIndex}`} className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] leading-5"><SpellLink id={ability.spellId} name={ability.name} />{ability.target && <span className="text-subtle">· {t("bossGuide.target", { target: ability.target })}</span>}</li>)}</ul></div>
          </details> : <div className="flex items-center gap-2.5 px-2.5 py-2"><span className="w-5 shrink-0 text-right text-[10px] font-semibold tabular-nums text-subtle">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1">{name}</span></div>}
        </li>;
      })}</ol>
      {visibleCount < names.length && <button type="button" onClick={() => setVisibleCount(names.length)}
        className="w-full cursor-pointer rounded-[var(--radius-sm)] px-3 py-2 text-[12px] font-semibold text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
        {t("reference.showMore", { count: names.length - visibleCount })}
      </button>}
    </>}
  </section>;
};

export default DungeonBossGuide;
