import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import DatabaseSectionTitle from "../database/database-section-title";
import { getCategoryConfig } from "../map/map-config";
import MapPointIcon from "../map/map-point-icon";
import { dungeonQuestTarget, isDungeonQuestTarget } from "./dungeon-quest-target";
import { dungeonQuestTitle, loadDungeonQuests, type DungeonQuestCollection } from "./dungeon-quest-data";
import { useReferenceNavigation, useSelectedReference } from "./reference-navigation-context";
import QuestCompletedTag from "../character-sync/quest-completed-tag";

const factionFilters = ["All", "Alliance", "Horde", "Both"] as const;
const questIcon = getCategoryConfig("quest");

const DungeonQuestGuide = ({ dungeonId }: { dungeonId: string }) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const openReference = useReferenceNavigation();
  const selectedReference = useSelectedReference();
  const [data, setData] = useState<DungeonQuestCollection>();
  const [faction, setFaction] = useState<(typeof factionFilters)[number]>("All");
  useEffect(() => {
    let active = true;
    void loadDungeonQuests(dungeonId).then((value) => { if (active) setData(value); })
      .catch((error: unknown) => {
        console.error("Failed to load dungeon quests", error);
      });
    return () => { active = false; };
  }, [dungeonId]);
  if (!data?.quests.length) return null;

  const hasFactionFilter = data.quests.some((quest) => quest.faction === "Alliance" || quest.faction === "Horde");
  const availableFactions = factionFilters.filter((option) => option === "All"
    || data.quests.some((quest) => (quest.faction ?? "Both") === option));
  const quests = data.quests.filter((quest) => {
    const side = quest.faction ?? "Both";
    return faction === "All" || side === "Both" || side === faction;
  });
  return <section className="space-y-3">
    <DatabaseSectionTitle count={quests.length}>{t("dungeonQuest.title")}</DatabaseSectionTitle>
    {hasFactionFilter && <div role="group" aria-label={t("reference.labels.faction")} className="flex flex-wrap gap-2">
      {availableFactions.map((option) => <button key={option} type="button"
        aria-pressed={faction === option} onClick={() => setFaction(option)}
        className={`cursor-pointer rounded-[var(--radius-md)] border px-3 py-2 text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-accent ${faction === option ? "border-accent/50 bg-surface-hover text-white" : "border-border text-zinc-300 hover:bg-surface-hover"}`}>
        {t(option === "All" ? "dungeonJournal.allQuests" : `map.foreverQuest.factions.${option}`)}
      </button>)}
    </div>}
    <ol className="space-y-1.5">{quests.map((quest) => {
      const selected = isDungeonQuestTarget(selectedReference) && selectedReference?.id === dungeonId
        && selectedReference.group === `quest:${quest.id}`;
      return <li key={quest.id}><button type="button" aria-pressed={selected}
        onClick={() => openReference(dungeonQuestTarget(dungeonId, quest.id, quest.title))}
        className={`flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border px-3 py-2 text-left text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-accent ${selected ? "border-accent/50 bg-surface-hover text-white" : "border-border bg-white/[0.025] text-white/90 hover:bg-surface-hover"}`}>
        <MapPointIcon fallback={questIcon.icon} source={questIcon.nativeIconPath} size={20} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{dungeonQuestTitle(quest, t, gameText)}
          <QuestCompletedTag questId={quest.id} />
        </span>
        <ChevronRight size={14} className="shrink-0 text-subtle" aria-hidden="true" />
      </button></li>;
    })}</ol>
  </section>;
};

export default DungeonQuestGuide;
