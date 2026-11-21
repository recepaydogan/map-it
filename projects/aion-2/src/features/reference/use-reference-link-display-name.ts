import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getItemDisplayName } from "../../lib/item-display-name";
import { useGameText } from "../../i18n/game-text";
import { isUnavailableQuestText, questLinkName } from "./quest-presentation";
import type { ReferenceLink } from "./reference-types";
import { useReferenceIndex } from "./use-reference-data";

export function useReferenceLinkDisplayName(links: ReferenceLink[]) {
  const { t } = useTranslation();
  const gameText = useGameText();
  const unnamedQuestIds = links.filter((link) => link.category === "quests" && isUnavailableQuestText(link.name))
    .map((link) => link.id).join("|");
  const questIndex = useReferenceIndex(Boolean(unnamedQuestIds));
  const indexData = questIndex.status === "ready" ? questIndex.data : null;
  const summaries = useMemo(() => {
    const ids = new Set(unnamedQuestIds.split("|"));
    return new Map(indexData?.entries.filter((entry) => ids.has(entry.id)).map((entry) => [entry.id, entry]) ?? []);
  }, [indexData, unnamedQuestIds]);
  return (link: ReferenceLink) => getItemDisplayName(link.name,
    gameText(questLinkName(link, t, summaries.get(link.id), gameText), link.id));
}
