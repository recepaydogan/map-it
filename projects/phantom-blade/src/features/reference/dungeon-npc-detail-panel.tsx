import { ArrowRight, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import { loadDungeonQuests, type DungeonQuestCollection } from "./dungeon-quest-data";
import { dungeonNpcName } from "./dungeon-npc-target";
import { dungeonQuestTarget } from "./dungeon-quest-target";
import { loadDungeonNpcPins, matchingDungeonNpcPin } from "./dungeon-npc-map-links";
import { useReferenceNavigation } from "./reference-navigation-context";
import type { ReferenceTarget } from "./reference-types";

const DungeonNpcDetailPanel = ({ target, onOpenMap }: {
  target: ReferenceTarget;
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  const [data, setData] = useState<DungeonQuestCollection>();
  const [npcPins, setNpcPins] = useState<Awaited<ReturnType<typeof loadDungeonNpcPins>>>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void loadDungeonQuests(target.id).then((value) => { if (active) setData(value); })
      .catch((cause: unknown) => { console.error("Failed to load dungeon NPC", cause); if (active) setError(true); });
    return () => { active = false; };
  }, [target.id]);
  useEffect(() => {
    let active = true;
    void loadDungeonNpcPins().then((value) => { if (active) setNpcPins(value); })
      .catch((cause: unknown) => console.error("Failed to load NPC map pins", cause));
    return () => { active = false; };
  }, []);
  if (error) return <p className="p-4 text-sm text-subtle" role="alert">{t("reference.error")}</p>;
  if (!data) return <p className="p-4 text-sm text-subtle" role="status">{t("reference.loading")}</p>;
  const name = dungeonNpcName(target);
  const related = data.quests.filter((quest) => quest.giver?.name === name || quest.turnIn?.name === name);
  if (!related.length) return <p className="p-4 text-sm text-subtle" role="alert">{t("reference.error")}</p>;
  const locations = [...new Set(related.flatMap((quest) =>
    [quest.giver, quest.turnIn].filter((npc) => npc?.name === name && npc.where).map((npc) => npc!.where!)))];
  return <article className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4">
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">{t("dungeonQuest.npc")}</p>
    <h2 className="mt-1 font-display text-xl font-semibold text-white">{name}</h2>
    {!!locations.length && <section className="mt-5 space-y-2">
      <DatabaseSectionTitle>{t("dungeonQuest.location")}</DatabaseSectionTitle>
      {locations.map((where) => {
        const mapLink = matchingDungeonNpcPin(npcPins, name, where);
        return mapLink ? <button key={where} type="button"
        onClick={() => onOpenMap(mapLink.mapId, mapLink.markerId)}
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-white/[0.025] px-3 py-2.5 text-left text-[12px] font-medium text-zinc-100 hover:border-accent/40 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
        <MapPin size={15} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="min-w-0 flex-1">{where.replace(/\s*\([^()]*\)\s*$/, "")}</span>
        <ArrowRight size={14} className="shrink-0 text-subtle" aria-hidden="true" />
      </button> : <p key={where} className="text-[13px] leading-relaxed text-zinc-200">{where}</p>;
      })}
    </section>}
    <section className="mt-5 space-y-2">
      <DatabaseSectionTitle count={related.length}>{t("dungeonQuest.relatedQuests")}</DatabaseSectionTitle>
      {related.map((quest) => <button key={quest.id} type="button"
        onClick={() => openReference(dungeonQuestTarget(target.id, quest.id, quest.title))}
        className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border border-border bg-white/[0.025] px-3 py-2.5 text-left text-[12px] font-medium text-zinc-100 hover:border-accent/40 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
        <span className="min-w-0 flex-1">{quest.title}</span><ArrowRight size={14} className="shrink-0 text-subtle" aria-hidden="true" />
      </button>)}
    </section>
  </article>;
};

export default DungeonNpcDetailPanel;
