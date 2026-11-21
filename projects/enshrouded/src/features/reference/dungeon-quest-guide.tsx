import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import { dungeonQuestTarget, isDungeonQuestTarget } from "./dungeon-quest-target";
import { loadDungeonQuests, type DungeonQuestCollection } from "./dungeon-quest-data";
import { useReferenceNavigation, useSelectedReference } from "./reference-navigation-context";

const DungeonQuestGuide = ({ dungeonId }: { dungeonId: string }) => {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  const selectedReference = useSelectedReference();
  const [data, setData] = useState<DungeonQuestCollection>();
  const [faction, setFaction] = useState<"Alliance" | "Horde">("Alliance");
  useEffect(() => {
    let active = true;
    void loadDungeonQuests(dungeonId).then((value) => { if (active) setData(value); })
      .catch((error: unknown) => console.error("Failed to load dungeon quests", error));
    return () => { active = false; };
  }, [dungeonId]);
  if (!data?.quests.length) return null;

  const hasFactionFilter = data.quests.some((quest) => quest.faction);
  const quests = hasFactionFilter ? data.quests.filter((quest) => !quest.faction || quest.faction === faction) : data.quests;
  return <section className="space-y-3">
    <DatabaseSectionTitle count={data.quests.length}>{t("dungeonQuest.title")}</DatabaseSectionTitle>
    {hasFactionFilter && <div role="group" aria-label={t("dungeonQuest.title")} className="grid grid-cols-2 gap-2">
      {(["Alliance", "Horde"] as const).map((option) => <button key={option} type="button"
        aria-pressed={faction === option} onClick={() => setFaction(option)}
        className={`flex cursor-pointer items-center justify-center rounded-[var(--radius-md)] border px-3 py-2.5 text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-accent ${faction === option ? "border-accent/50 bg-accent-soft text-accent" : "border-border bg-white/[0.025] text-zinc-300 hover:border-accent/30 hover:text-zinc-100"}`}>
        {option} <span className="ml-1 opacity-70">{data.quests.filter((quest) => !quest.faction || quest.faction === option).length}</span>
      </button>)}
    </div>}
    <ol className="space-y-1.5">{quests.map((quest) => {
      const selected = isDungeonQuestTarget(selectedReference) && selectedReference?.id === dungeonId
        && selectedReference.group === `quest:${quest.id}`;
      return <li key={quest.id}><button type="button" aria-pressed={selected}
        onClick={() => openReference(dungeonQuestTarget(dungeonId, quest.id, quest.title))}
        className={`flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-2.5 text-left text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-accent ${selected ? "border-accent/50 bg-accent-soft text-zinc-100" : "border-border bg-white/[0.025] text-zinc-200 hover:border-accent/40 hover:bg-accent-soft"}`}>
        <span className="min-w-0 flex-1">{quest.title}</span>
        <ArrowRight size={14} className="shrink-0 text-subtle" aria-hidden="true" />
      </button></li>;
    })}</ol>
  </section>;
};

export default DungeonQuestGuide;
