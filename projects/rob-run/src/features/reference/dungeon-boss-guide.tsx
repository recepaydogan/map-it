import { ChevronRight, Swords } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { useReferenceNavigation, useSelectedReference } from "./reference-navigation-context";
import DatabaseSectionTitle from "../database/database-section-title";
import ProgressiveList from "../../components/progressive-list";
import { dungeonBossTarget, isDungeonBossTarget } from "./dungeon-boss-target";
import { cachedBossData, dungeonBossLootIds, loadBossData, type BossData } from "./dungeon-boss-data";
import { dungeonCreatureName } from "./dungeon-journal";

const DungeonBossGuide = ({ dungeonId, encounters = [], compact = false }: {
  dungeonId: string;
  encounters?: { id: number; nameKey: string }[];
  compact?: boolean;
}) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const openReference = useReferenceNavigation();
  const selectedReference = useSelectedReference();
  const [data, setData] = useState<BossData | null>(cachedBossData);
  useEffect(() => {
    let active = true;
    void loadBossData().then((value) => { if (active) setData(value); }).catch((error: unknown) => {
      console.error("Failed to load dungeon boss guide", error);
    });
    return () => { active = false; };
  }, []);
  const guide = data?.guides[dungeonId];
  const roster = data?.rosters[dungeonId];
  const names = guide?.bosses.map((boss) => boss.name)
    ?? (encounters.length ? encounters.map((encounter) => t(encounter.nameKey, { lng: "en" })) : roster?.bosses ?? []);
  if (!names.length) return null;
  const title = t(compact ? "reference.labels.bosses" : "dungeonJournal.bossesAndLoot");
  const listClassName = compact ? "space-y-1.5"
    : "columns-[2_calc(19rem*var(--app-font-scale))] gap-x-3 [&>button]:mb-1.5";
  return <section className="space-y-3" aria-label={title}>
    <DatabaseSectionTitle count={names.length}>{title}</DatabaseSectionTitle>
    <ProgressiveList initialCount={compact ? 8 : 12} className={listClassName}>{names.map((name, index) => {
      const boss = guide?.bosses[index];
      const dropCount = dungeonBossLootIds(dungeonId, name, boss?.loot).length;
      const npcId = boss?.npcId ?? roster?.mechanics?.[name]?.npcIds[0];
      const encounter = !guide ? encounters[index] : undefined;
      const displayName = encounter ? t(encounter.nameKey) : dungeonCreatureName(name, t, gameText, npcId);
      const target = dungeonBossTarget(dungeonId, index, name);
      const selected = isDungeonBossTarget(selectedReference) && selectedReference?.id === dungeonId
        && selectedReference.group === target.group;
      return <button key={`${name}-${index}`} type="button" aria-pressed={selected} onClick={() => openReference(target)}
        className={`flex w-full break-inside-avoid cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-accent ${selected ? "border-accent/45 bg-surface-hover text-zinc-100" : "border-border bg-white/[0.025] text-zinc-300 hover:border-accent/35"}`}>
        <span className="grid size-6 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-danger/15 text-danger-text"><Swords size={14} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1 text-[12px] font-semibold leading-snug [overflow-wrap:anywhere]">{displayName}</span>
        {boss?.rare && <span className="shrink-0 text-[10px] font-medium text-accent">{t("bossGuide.rare")}</span>}
        {!!dropCount && <span className="shrink-0 text-[11px] text-subtle">{t("dungeonJournal.dropCount", { count: dropCount })}</span>}
        <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-subtle" />
      </button>;
    })}</ProgressiveList>
  </section>;
};

export default DungeonBossGuide;
