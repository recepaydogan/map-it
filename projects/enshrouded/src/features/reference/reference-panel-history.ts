import type { ReferenceTarget } from "./reference-types";
import { isDungeonBossTarget } from "./dungeon-boss-target";
import { isDungeonQuestTarget } from "./dungeon-quest-target";
import { isDungeonNpcTarget } from "./dungeon-npc-target";

/** Side inspection keeps its dungeon or item source visible. */
export function referencePanelHistory(history: ReferenceTarget[]) {
  let end = history.length;
  while (end > 0 && (history[end - 1]?.category === "items" || isDungeonBossTarget(history[end - 1])
    || isDungeonQuestTarget(history[end - 1]) || isDungeonNpcTarget(history[end - 1]))) end--;
  return { main: history.slice(0, end), side: history.slice(end) };
}
