import { ArrowRight, MapPin } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import ItemIcon from "../database/item-icon";
import { useItemCatalog } from "../database/use-item-catalog";
import { dungeonQuestId, dungeonQuestTarget } from "./dungeon-quest-target";
import { loadDungeonQuests, type DungeonQuest, type DungeonQuestCollection, type DungeonQuestItem } from "./dungeon-quest-data";
import { useReferenceNavigation } from "./reference-navigation-context";
import type { ReferenceTarget } from "./reference-types";
import type { SearchLocation } from "../map/map-global-search";
import { loadGlobalMapSearchCatalog } from "../map/use-global-map-search";
import QuestDetailsSections from "./quest-details-sections";
import QuestRewardDetails from "./quest-reward-details";
import { hasQuestRewards, itemMentions } from "./quest-reward-utils";

const normalizeChainName = (value: string) =>
  value.replace(/^(?:Comes after|Leads to)\s+/i, "").replace(/↗/g, "").trim();
const comparable = (value: string) => value.toLowerCase().replace(/’/g, "'");
const DungeonQuestDetailPanel = ({ target, dungeonName, dungeonLocation, openedFromDungeon, onOpenMap }: {
  target: ReferenceTarget; dungeonName?: string; openedFromDungeon: boolean;
  dungeonLocation?: { mapId: string; markerId: string };
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  const catalogState = useItemCatalog();
  const [data, setData] = useState<DungeonQuestCollection>();
  const [questMarkers, setQuestMarkers] = useState<SearchLocation[]>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void loadDungeonQuests(target.id).then((value) => { if (active) setData(value); })
      .catch((cause: unknown) => { console.error("Failed to load dungeon quest", cause); if (active) setError(true); });
    return () => { active = false; };
  }, [target.id]);
  useEffect(() => {
    let active = true;
    void loadGlobalMapSearchCatalog().then((catalog) => {
      if (active) setQuestMarkers(catalog.locations.filter((location) =>
        ["quest", "repeatable-quest"].includes(location.point.category)
          && (!target.name || location.point.name.toLowerCase() === target.name.toLowerCase())));
    }).catch((cause: unknown) => console.error("Failed to load quest map markers", cause));
    return () => { active = false; };
  }, [target.name]);
  const itemById = useMemo(() => new Map(catalogState.status === "ready"
    ? catalogState.catalog.items.map((item) => [item.id, item]) : []), [catalogState]);
  if (error) return <p className="p-4 text-sm text-subtle" role="alert">{t("reference.error")}</p>;
  if (!data) return <p className="p-4 text-sm text-subtle" role="status">{t("reference.loading")}</p>;
  const quest = data.quests.find((entry) => entry.id === dungeonQuestId(target));
  if (!quest) return <p className="p-4 text-sm text-subtle" role="alert">{t("reference.error")}</p>;
  const markerMatches = (questMarkers ?? []).filter(({ point }) => {
    if (!["quest", "repeatable-quest"].includes(point.category) || point.name.toLowerCase() !== quest.title.toLowerCase()) return false;
    if (!("questInfo" in point)) return false;
    if (point.questNpcDungeonIds?.length && !point.questNpcDungeonIds.includes(target.id)) return false;
    if (point.questInfo?.requiredLevel !== undefined && quest.minimumLevel !== undefined
      && point.questInfo.requiredLevel !== quest.minimumLevel) return false;
    const markerNpc = point.questNpcNameKey ? t(point.questNpcNameKey)
      : point.questInfo?.startsAtKey ? t(point.questInfo.startsAtKey) : undefined;
    return !markerNpc || !quest.giver?.name || markerNpc.toLowerCase() === quest.giver.name.toLowerCase();
  });
  const questMarker = markerMatches.length === 1 ? markerMatches[0] : undefined;
  const markerInfo = questMarker && "questInfo" in questMarker.point ? questMarker.point.questInfo : undefined;
  const factionName = markerInfo?.faction ?? quest.faction;
  const faction = factionName ? t(`map.foreverQuest.factions.${factionName}`) : undefined;

  const questByName = new Map<string, DungeonQuest[]>();
  for (const entry of data.quests) {
    const group = questByName.get(entry.title.toLowerCase()) ?? [];
    group.push(entry);
    questByName.set(entry.title.toLowerCase(), group);
  }
  const knownItems = [...itemById.values()];
  const objectiveItems = itemMentions(quest.objective, knownItems.filter((item) =>
    quest.objectives?.some((objective) => comparable(objective.replace(/\s*×\d+$/, "")) === comparable(item.name))), data.itemLinks);
  const renderLinkedText = (value: string, items: DungeonQuestItem[] = []): ReactNode => {
    const candidates: { text: string; icon?: string; open: () => void }[] = [
      ...items.filter((item) => itemById.has(item.id)).map((item) => ({
        text: item.name, icon: itemById.get(item.id)?.icon,
        open: () => openReference({ category: "items", id: item.id, name: item.name }),
      })),
      ...data.quests.filter((entry) => entry.id !== quest.id && questByName.get(entry.title.toLowerCase())?.length === 1)
        .map((entry) => ({
          text: entry.title, open: () => openReference(dungeonQuestTarget(target.id, entry.id, entry.title)),
        })),
    ].sort((left, right) => right.text.length - left.text.length);
    const matches: { start: number; end: number; text: string; icon?: string; open: () => void }[] = [];
    for (const candidate of candidates) {
      const start = comparable(value).indexOf(comparable(candidate.text));
      if (start < 0) continue;
      const end = start + candidate.text.length;
      if ((start > 0 && /[\p{L}\p{N}]/u.test(value[start - 1]!))
        || (end < value.length && /[\p{L}\p{N}]/u.test(value[end]!))
        || matches.some((match) => start < match.end && end > match.start)) continue;
      matches.push({ start, end, text: value.slice(start, end), icon: candidate.icon, open: candidate.open });
    }
    if (!matches.length) return value;
    matches.sort((left, right) => left.start - right.start);
    const parts: ReactNode[] = [];
    let position = 0;
    for (const match of matches) {
      parts.push(value.slice(position, match.start));
      parts.push(<button key={match.start} type="button" onClick={match.open}
        className="inline-flex cursor-pointer items-center gap-1 align-middle font-medium text-accent underline decoration-accent/60 underline-offset-2 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
        {match.icon && <ItemIcon icon={match.icon} name={match.text} size={22} />}{match.text}
      </button>);
      position = match.end;
    }
    parts.push(value.slice(position));
    return parts;
  };
  return <article className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4">
    <h2 className="font-display text-xl font-semibold text-white">{quest.title}</h2>
    <QuestDetailsSections requiredLevel={markerInfo?.requiredLevel ?? quest.minimumLevel}
      questLevel={quest.level} faction={faction} objective={renderLinkedText(quest.objective, objectiveItems)}
      startsWith={quest.giver?.name ?? quest.startsAt}
      turnInTo={quest.turnIn?.name}
      rewards={hasQuestRewards(quest) && <QuestRewardDetails quest={quest} itemById={itemById} itemLinks={data.itemLinks} />} />
    {!openedFromDungeon && <section className="mt-5 space-y-2">
      <DatabaseSectionTitle>{t("dungeonQuest.dungeon")}</DatabaseSectionTitle>
      {dungeonLocation ? <button type="button" onClick={() => onOpenMap(dungeonLocation.mapId, dungeonLocation.markerId)}
        className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border border-border bg-white/[0.025] px-3 py-2.5 text-left text-[12px] font-medium text-zinc-100 hover:border-accent/40 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
        <span className="min-w-0 flex-1">{dungeonName ?? t("dungeonQuest.dungeon")}</span>
        <ArrowRight size={14} className="shrink-0 text-subtle" aria-hidden="true" />
      </button> : <p className="text-[12px] text-zinc-200">{dungeonName ?? t("dungeonQuest.dungeon")}</p>}
    </section>}
    {!!quest.chain?.length && <section className="mt-5 space-y-2">
      <DatabaseSectionTitle>{t("dungeonQuest.chain")}</DatabaseSectionTitle>
      <div className="space-y-1.5">{quest.chain.map((value, index) => {
        const name = normalizeChainName(value);
        const label = value.replace(/↗/g, "").trim();
        const prefix = label.slice(0, label.length - name.length);
        const matches = questByName.get(name.toLowerCase()) ?? [];
        const linked = matches.length === 1 && matches[0]!.id !== quest.id ? matches[0] : undefined;
        return linked ? <p key={index} className="text-[12px] text-subtle">{prefix}<button type="button"
          onClick={() => openReference(dungeonQuestTarget(target.id, linked.id, linked.title))}
          className="cursor-pointer font-medium text-accent underline underline-offset-2 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">{name}</button></p>
          : <p key={index} className="text-[12px] text-subtle">{label}</p>;
      })}</div>
    </section>}
    {questMarker && <button type="button" onClick={() => onOpenMap(questMarker.mapId, questMarker.point.id)}
      className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-accent/50 bg-accent-soft px-3 py-2.5 text-[12px] font-semibold text-accent hover:border-accent hover:bg-accent/15 focus-visible:outline-2 focus-visible:outline-accent">
      <MapPin size={14} aria-hidden="true" />{t("dungeonQuest.showOnMap")}
    </button>}
  </article>;
};

export default DungeonQuestDetailPanel;
