import { getItemDisplayName } from "../../lib/item-display-name";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import MapReferencePanel from "../map/map-reference-panel";
import ReferenceDetail from "./reference-detail";
import { ReferenceNavigationContext, SelectedReferenceContext, sameReferenceTarget, useReferenceNavigation } from "./reference-navigation-context";
import { navigateReferenceHistory } from "./reference-history";
import { referencePanelHistory } from "./reference-panel-history";
import { isDungeonBossTarget } from "./dungeon-boss-target";
import { isDungeonQuestTarget } from "./dungeon-quest-target";
import { isDungeonNpcTarget } from "./dungeon-npc-target";
import type { ReferenceNavigationProps, ReferenceSummary, ReferenceTarget } from "./reference-types";

const AdventureDetailWorkspace = ({ summary, onOpenMap, ...navigation }: ReferenceNavigationProps & {
  summary: ReferenceSummary; onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const outerOpen = useReferenceNavigation();
  const [history, setHistory] = useState<ReferenceTarget[]>([]);
  const panels = referencePanelHistory(history);
  const current = panels.main[panels.main.length - 1];
  const previous = panels.main[panels.main.length - 2];
  const side = panels.side[panels.side.length - 1];
  const open = (target: ReferenceTarget) => {
    if (!["creatures", "dungeons", "items", "boxes", "recipes"].includes(target.category)) return outerOpen(target);
    if (target.category === summary.category && target.id === summary.id && !target.group) return setHistory([]);
    setHistory((currentHistory) => {
      const trail = target.category === "items" || isDungeonBossTarget(target) || isDungeonQuestTarget(target)
        || isDungeonNpcTarget(target)
        ? currentHistory : referencePanelHistory(currentHistory).main;
      return navigateReferenceHistory(trail, trail[trail.length - 1] ?? null, target);
    });
  };
  const openFromMain = (target: ReferenceTarget) => {
    if (sameReferenceTarget(side, target)) setHistory(panels.main);
    else open(target);
  };
  return <ReferenceNavigationContext.Provider value={open}>
    <div className="@container flex h-full min-h-0 min-w-0">
      <SelectedReferenceContext.Provider value={side ?? null}>
      <ReferenceNavigationContext.Provider value={openFromMain}>
      <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", side && "hidden @min-[640px]:flex")}>
        {current ? <MapReferencePanel target={current} backLabel={previous?.name ?? summary.name}
          onBack={() => setHistory(panels.main.slice(0, -1))} onClose={() => setHistory([])} onOpenMap={onOpenMap} />
          : <ReferenceDetail summary={summary} onOpenMap={onOpenMap} {...navigation} />}
      </div>
      </ReferenceNavigationContext.Provider>
      </SelectedReferenceContext.Provider>
      {side && <aside aria-label={getItemDisplayName(side.name ?? t(`reference.categories.${side.category}`))}
        className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-border bg-surface @min-[640px]:max-w-[23rem]">
        <MapReferencePanel target={side}
          backLabel={panels.side[panels.side.length - 2]?.name ?? current?.name ?? summary.name}
          openedFromDungeon={(summary.category === "dungeons" && summary.id === side.id)
            || panels.main.some((entry) => entry.category === "dungeons" && entry.id === side.id && !entry.group)}
          onBack={() => setHistory(history.slice(0, -1))} onClose={() => setHistory(panels.main)} onOpenMap={onOpenMap} />
      </aside>}
    </div>
  </ReferenceNavigationContext.Provider>;
};
export default AdventureDetailWorkspace;
