import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadDungeonQuests, type DungeonQuest } from "../reference/dungeon-quest-data";
import { dungeonQuestTarget } from "../reference/dungeon-quest-target";
import { sameReferenceTarget, useReferenceNavigation, useSelectedReference } from "../reference/reference-navigation-context";

type RelatedQuest = { dungeonId: string; quest: DungeonQuest };

const MapQuestNpcGuides = ({ npcName, dungeonIds }: { npcName: string; dungeonIds: string[] }) => {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  const selectedReference = useSelectedReference();
  const [related, setRelated] = useState<RelatedQuest[]>();
  const dungeonKey = dungeonIds.join("|");

  useEffect(() => {
    let active = true;
    const ids = dungeonKey.split("|").filter(Boolean);
    void Promise.allSettled(ids.map((dungeonId) => loadDungeonQuests(dungeonId))).then((results) => {
      if (!active) return;
      setRelated(results.flatMap((result, index) => result.status === "fulfilled"
        ? result.value.quests.filter((quest) => quest.giver?.name === npcName || quest.turnIn?.name === npcName)
          .map((quest) => ({ dungeonId: ids[index]!, quest }))
        : []));
    });
    return () => { active = false; };
  }, [npcName, dungeonKey]);

  if (!related?.length) return null;
  return <section className="mt-4 space-y-2 border-t border-border pt-4">
    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">{t("map.questNpcs.relatedQuestGuides")}</p>
    {related.map(({ dungeonId, quest }) => {
      const target = dungeonQuestTarget(dungeonId, quest.id, quest.title);
      return <button key={`${dungeonId}:${quest.id}`} type="button" onClick={() => openReference(target)}
        aria-pressed={sameReferenceTarget(selectedReference, target)}
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-white/[0.025] px-3 py-2.5 text-left text-[12px] font-medium text-zinc-100 hover:border-accent/40 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
        <span className="min-w-0 flex-1">{quest.title}</span>
        <ArrowRight size={14} className="shrink-0 text-subtle" aria-hidden="true" />
      </button>;
    })}
  </section>;
};

export default MapQuestNpcGuides;
