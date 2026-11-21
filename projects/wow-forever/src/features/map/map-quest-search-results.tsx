import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import type { SearchLocation, SearchQuestResult } from "./map-global-search";
import { getLocalizedMapPointDisplayName } from "./map-point-display-name";
import { questRowId } from "./map-search-rows";
import { getCategoryConfig } from "./map-config";
import MapPointIcon from "./map-point-icon";
import QuestCompletedTag from "../character-sync/quest-completed-tag";

const questIcon = getCategoryConfig("quest");

export default function MapQuestSearchResults({ quests, activeRowId, onHover, onSelect }: {
  quests: SearchQuestResult[];
  activeRowId: string | null;
  onHover: (id: string) => void;
  onSelect: (location: SearchLocation) => void;
}) {
  const { t } = useTranslation();
  const gameText = useGameText();
  if (!quests.length) return null;
  return <>
    <div role="presentation" className="border-t border-border px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-subtle">{t("map.search.sectionQuests")}</div>
    {quests.map(result => {
      const id = questRowId(result);
      const { quest, location } = result;
      return <button key={id} id={`map-search-row-${id}`} type="button" role="option" aria-selected={activeRowId === id}
        onMouseEnter={() => onHover(id)} onClick={() => onSelect(location)}
        className={cn("flex min-h-11 w-full cursor-pointer items-start gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent", activeRowId === id ? "bg-white/10" : "hover:bg-surface-hover")}>
        <span className="grid size-7 shrink-0 self-center place-items-center" aria-hidden="true">
          <MapPointIcon fallback={questIcon.icon} source={questIcon.nativeIconPath} size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-[12px] font-semibold text-white">{gameText(quest.name, `Quest:${quest.id}:0`)}</strong>
          <QuestCompletedTag questId={quest.id} />
          <span className="mt-0.5 block text-[11px] text-zinc-200">{t("map.search.questGiver", { name: getLocalizedMapPointDisplayName(location.point, gameText) })}</span>
          <span className="block text-[10px] text-subtle">{[...new Set([location.mapName, location.point.region].filter(Boolean))].map(part => gameText(part)).join(" · ")}</span>
        </span>
        {quest.level !== undefined && <span className="shrink-0 pt-0.5 text-[10px] tabular-nums text-zinc-400">{t("map.foreverQuest.level", { level: quest.level })}</span>}
      </button>;
    })}
  </>;
}
