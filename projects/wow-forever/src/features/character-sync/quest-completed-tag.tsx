import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { contentUrl } from "../../lib/content-url";
import { useSelectedMapCharacterId } from "../map/map-character-profiles";
import { loadGlobalMapSearchCatalog } from "../map/use-global-map-search";
import { useCharacterSync } from "./character-sync-store";
import { indexQuestCompletion, isCompletedOnceQuest, type QuestCompletionIndex } from "./quest-completion";

let indexRequest: Promise<QuestCompletionIndex> | undefined;
const loadIndex = () => {
  indexRequest ??= Promise.all([
    loadGlobalMapSearchCatalog(),
    fetch(contentUrl("data/quests/quest-details.json")).then(async response => {
      if (!response.ok) throw new Error(`Quest identity data: HTTP ${response.status}`);
      const data = await response.json() as { version: number; markerQuestIds: Record<string, string> };
      if (data.version !== 1 || !data.markerQuestIds) throw new Error("Invalid quest identity data");
      return data.markerQuestIds;
    }),
  ]).then(([catalog, markers]) => indexQuestCompletion(catalog.locations.map(location => location.point), markers))
    .catch((error: unknown) => { indexRequest = undefined; throw error; });
  return indexRequest;
};

/** Shared by map rows and detail headings; observes the selected character across windows. */
export default function QuestCompletedTag({ questId, markerId }: { questId?: string; markerId?: string }) {
  const { t } = useTranslation();
  const sync = useCharacterSync();
  const selectedId = useSelectedMapCharacterId();
  const id = selectedId ?? sync.currentId;
  const character = id ? sync.characters[id] : undefined;
  const hasCompletions = !!character?.completedQuests?.ids.length;
  const [index, setIndex] = useState<QuestCompletionIndex>();
  useEffect(() => {
    if (!hasCompletions) return;
    let active = true;
    void loadIndex().then(value => { if (active) setIndex(value); })
      .catch(error => console.warn("Could not verify quest completion", error));
    return () => { active = false; };
  }, [hasCompletions]);
  const resolvedId = questId ?? (markerId ? index?.markerQuestIds[markerId] : undefined);
  if (!isCompletedOnceQuest(character, resolvedId, index)) return null;
  return <span className="mt-1 block">
    <span className="inline-flex items-center gap-1 rounded border border-emerald-400/40 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-emerald-300">
      <Check size={11} aria-hidden="true" />{t("questStatus.completed")}
    </span>
  </span>;
}
